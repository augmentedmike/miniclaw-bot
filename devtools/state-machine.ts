/**
 * State machine detector & visualizer.
 *
 * Finds implicit state machines in TypeScript code by detecting:
 * - Event handler registrations (.on/.once/.addEventListener)
 * - Sequential async flows (await chains with branching)
 * - Process/lifecycle patterns (spawn → data → close → error)
 * - Switch/if on state-like variables
 * - Try/catch error recovery flows
 *
 * Outputs ASCII or Mermaid stateDiagram-v2.
 *
 * Usage:
 *   npx tsx devtools/state-machine.ts [--format ascii|mermaid] [--root src/]
 */

import fs from "node:fs";
import path from "node:path";

export type State = {
  name: string;
  kind: "initial" | "normal" | "error" | "terminal";
};

export type Transition = {
  from: string;
  to: string;
  trigger: string;
};

export type StateMachine = {
  file: string;
  name: string;
  states: State[];
  transitions: Transition[];
};

// --- Detectors ---

const EVENT_HANDLER_RE = /(\w+)\.(?:on|once|addEventListener)\s*\(\s*['"]([\w:]+)['"]/g;
const AWAIT_CALL_RE = /await\s+(\w[\w.]*)\s*\(/g;
const SPAWN_RE = /(?:spawn|exec|execFile|fork)\s*\(/g;
const PROMISE_RE = /new\s+Promise/g;
const TRY_CATCH_RE = /\btry\s*\{/g;
const THROW_RE = /\bthrow\s+/g;
const PROCESS_EXIT_RE = /process\.exit\s*\(/g;
const RETURN_RE = /\breturn\b/g;
const STATE_VAR_RE = /(?:state|status|phase|step|mode)\s*(?:===?|!==?)\s*['"]\w+['"]/gi;
const SWITCH_STATE_RE = /switch\s*\(\s*(?:state|status|phase|step|mode)\s*\)/gi;

/**
 * Detect event-driven state machines (e.g. process.on, bot.on).
 */
export function detectEventDriven(content: string, fileName: string): StateMachine | null {
  const events: Array<{ target: string; event: string; line: number }> = [];
  EVENT_HANDLER_RE.lastIndex = 0;
  let m;
  while ((m = EVENT_HANDLER_RE.exec(content)) !== null) {
    const line = content.slice(0, m.index).split("\n").length;
    events.push({ target: m[1]!, event: m[2]!, line });
  }

  if (events.length < 2) return null;

  // Group by target object
  const byTarget = new Map<string, typeof events>();
  for (const e of events) {
    if (!byTarget.has(e.target)) byTarget.set(e.target, []);
    byTarget.get(e.target)!.push(e);
  }

  const machines: StateMachine[] = [];
  for (const [target, evts] of byTarget) {
    if (evts.length < 2) continue;

    const states: State[] = [{ name: "idle", kind: "initial" }];
    const transitions: Transition[] = [];

    for (const evt of evts) {
      const stateName = evt.event.replace(/:/g, "_");
      const isError = /error|fail|reject/i.test(evt.event);
      const isEnd = /close|end|stop|exit|finish/i.test(evt.event);

      states.push({
        name: stateName,
        kind: isError ? "error" : isEnd ? "terminal" : "normal",
      });
      transitions.push({ from: "idle", to: stateName, trigger: evt.event });

      if (!isError && !isEnd) {
        transitions.push({ from: stateName, to: "idle", trigger: "done" });
      }
    }

    machines.push({ file: fileName, name: `${target}_events`, states, transitions });
  }

  return machines[0] ?? null;
}

/**
 * Detect sequential async flows (await chains).
 */
export function detectAsyncFlow(content: string, fileName: string): StateMachine | null {
  // Find exported async functions
  const funcRe = /export\s+(?:async\s+)?function\s+(\w+)[^{]*\{/g;
  const results: StateMachine[] = [];

  let funcMatch;
  while ((funcMatch = funcRe.exec(content)) !== null) {
    const funcName = funcMatch[1]!;
    const bodyStart = funcMatch.index + funcMatch[0].length;

    // Find function body by brace matching
    let depth = 1;
    let pos = bodyStart;
    while (pos < content.length && depth > 0) {
      if (content[pos] === "{") depth++;
      else if (content[pos] === "}") depth--;
      pos++;
    }
    const body = content.slice(bodyStart, pos - 1);

    // Count awaits
    const awaits: string[] = [];
    AWAIT_CALL_RE.lastIndex = 0;
    let am;
    while ((am = AWAIT_CALL_RE.exec(body)) !== null) {
      awaits.push(am[1]!);
    }

    if (awaits.length < 2) continue;

    const states: State[] = [{ name: "start", kind: "initial" }];
    const transitions: Transition[] = [];

    let prev = "start";
    for (const call of awaits) {
      const name = call.replace(/\./g, "_");
      states.push({ name, kind: "normal" });
      transitions.push({ from: prev, to: name, trigger: `await ${call}()` });
      prev = name;
    }

    // Check for try/catch
    const hasTryCatch = TRY_CATCH_RE.test(body);
    if (hasTryCatch) {
      states.push({ name: "error", kind: "error" });
      transitions.push({ from: prev, to: "error", trigger: "catch" });
    }

    // Terminal
    states.push({ name: "complete", kind: "terminal" });
    transitions.push({ from: prev, to: "complete", trigger: "return" });

    results.push({ file: fileName, name: `${funcName}_flow`, states, transitions });
  }

  return results[0] ?? null;
}

/**
 * Detect process/child_process lifecycle patterns.
 */
export function detectProcessLifecycle(content: string, fileName: string): StateMachine | null {
  SPAWN_RE.lastIndex = 0;
  if (!SPAWN_RE.test(content)) return null;

  const hasStdout = /\.stdout\.on\s*\(\s*["']data["']/g.test(content);
  const hasStderr = /\.stderr\.on\s*\(\s*["']data["']/g.test(content);
  const hasClose = /\.on\s*\(\s*["']close["']/g.test(content);
  const hasError = /\.on\s*\(\s*["']error["']/g.test(content);

  if (!hasClose && !hasError) return null;

  const states: State[] = [
    { name: "spawning", kind: "initial" },
    { name: "running", kind: "normal" },
  ];
  const transitions: Transition[] = [
    { from: "spawning", to: "running", trigger: "spawn()" },
  ];

  if (hasStdout) {
    states.push({ name: "stdout_data", kind: "normal" });
    transitions.push({ from: "running", to: "stdout_data", trigger: "stdout.data" });
    transitions.push({ from: "stdout_data", to: "running", trigger: "accumulate" });
  }
  if (hasStderr) {
    states.push({ name: "stderr_data", kind: "normal" });
    transitions.push({ from: "running", to: "stderr_data", trigger: "stderr.data" });
    transitions.push({ from: "stderr_data", to: "running", trigger: "accumulate" });
  }
  if (hasClose) {
    states.push({ name: "closed", kind: "terminal" });
    transitions.push({ from: "running", to: "closed", trigger: "close" });
  }
  if (hasError) {
    states.push({ name: "error", kind: "error" });
    transitions.push({ from: "running", to: "error", trigger: "error" });
  }

  return { file: fileName, name: "process_lifecycle", states, transitions };
}

/**
 * Detect state variable switching patterns.
 */
export function detectStateSwitching(content: string, fileName: string): StateMachine | null {
  SWITCH_STATE_RE.lastIndex = 0;
  STATE_VAR_RE.lastIndex = 0;

  const stateValues = new Set<string>();
  let m;

  // Find state comparisons: state === "value"
  while ((m = STATE_VAR_RE.exec(content)) !== null) {
    const valueMatch = m[0].match(/['"]([\w]+)['"]/);
    if (valueMatch) stateValues.add(valueMatch[1]!);
  }

  if (stateValues.size < 2) return null;

  const states: State[] = [];
  const transitions: Transition[] = [];
  const stateList = [...stateValues];

  for (const s of stateList) {
    const isError = /error|fail/i.test(s);
    const isEnd = /done|complete|finish|stop/i.test(s);
    const isStart = /init|start|idle|pending/i.test(s);
    states.push({
      name: s,
      kind: isStart ? "initial" : isError ? "error" : isEnd ? "terminal" : "normal",
    });
  }

  // Infer transitions from adjacency in code
  for (let i = 0; i < stateList.length - 1; i++) {
    transitions.push({
      from: stateList[i]!,
      to: stateList[i + 1]!,
      trigger: "transition",
    });
  }

  return { file: fileName, name: "state_machine", states, transitions };
}

/**
 * Detect try/catch error recovery flows.
 */
export function detectErrorRecovery(content: string, fileName: string): StateMachine | null {
  const tryCatchBlocks: Array<{ hasRetry: boolean; hasThrow: boolean; hasFallback: boolean }> = [];

  TRY_CATCH_RE.lastIndex = 0;
  let m;
  while ((m = TRY_CATCH_RE.exec(content)) !== null) {
    const afterTry = content.slice(m.index, Math.min(m.index + 500, content.length));
    tryCatchBlocks.push({
      hasRetry: /retry|again|attempt/i.test(afterTry),
      hasThrow: THROW_RE.test(afterTry),
      hasFallback: /fallback|plain|default/i.test(afterTry),
    });
  }

  if (tryCatchBlocks.length === 0) return null;

  const states: State[] = [
    { name: "attempt", kind: "initial" },
    { name: "success", kind: "terminal" },
    { name: "caught", kind: "error" },
  ];
  const transitions: Transition[] = [
    { from: "attempt", to: "success", trigger: "no error" },
    { from: "attempt", to: "caught", trigger: "catch" },
  ];

  const hasRetry = tryCatchBlocks.some((b) => b.hasRetry);
  const hasFallback = tryCatchBlocks.some((b) => b.hasFallback);

  if (hasRetry) {
    transitions.push({ from: "caught", to: "attempt", trigger: "retry" });
  }
  if (hasFallback) {
    states.push({ name: "fallback", kind: "normal" });
    transitions.push({ from: "caught", to: "fallback", trigger: "fallback" });
    transitions.push({ from: "fallback", to: "success", trigger: "complete" });
  }

  return { file: fileName, name: "error_recovery", states, transitions };
}

// --- Main scanner ---

export function scanFile(content: string, fileName: string): StateMachine[] {
  const machines: StateMachine[] = [];

  const eventDriven = detectEventDriven(content, fileName);
  if (eventDriven) machines.push(eventDriven);

  const asyncFlow = detectAsyncFlow(content, fileName);
  if (asyncFlow) machines.push(asyncFlow);

  const processLife = detectProcessLifecycle(content, fileName);
  if (processLife) machines.push(processLife);

  const stateSwitching = detectStateSwitching(content, fileName);
  if (stateSwitching) machines.push(stateSwitching);

  const errorRecovery = detectErrorRecovery(content, fileName);
  if (errorRecovery) machines.push(errorRecovery);

  return machines;
}

export function scanDirectory(rootDir: string): StateMachine[] {
  const files = findTsFiles(rootDir);
  const all: StateMachine[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(rootDir, file);
    all.push(...scanFile(content, rel));
  }
  return all;
}

// --- Formatters ---

export function formatAscii(machines: StateMachine[]): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║           STATE MACHINE MAP                     ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  if (machines.length === 0) {
    lines.push("No state machines detected.");
    return lines.join("\n");
  }

  for (const machine of machines) {
    lines.push(`┌─── ${machine.file} :: ${machine.name} ───`);

    // States
    for (const state of machine.states) {
      const icon =
        state.kind === "initial" ? "●" :
        state.kind === "terminal" ? "◉" :
        state.kind === "error" ? "✗" : "○";
      lines.push(`│  ${icon} ${state.name}`);
    }

    lines.push("│");

    // Transitions
    for (const t of machine.transitions) {
      lines.push(`│  ${t.from} ──[${t.trigger}]──▶ ${t.to}`);
    }

    lines.push("└───");
    lines.push("");
  }

  lines.push(`Total: ${machines.length} state machines, ${machines.reduce((s, m) => s + m.states.length, 0)} states, ${machines.reduce((s, m) => s + m.transitions.length, 0)} transitions`);

  return lines.join("\n");
}

export function formatMermaid(machines: StateMachine[]): string {
  const lines: string[] = [];

  for (const machine of machines) {
    lines.push(`%% ${machine.file} :: ${machine.name}`);
    lines.push("stateDiagram-v2");

    for (const state of machine.states) {
      const id = state.name.replace(/[^a-zA-Z0-9_]/g, "_");
      if (state.kind === "initial") {
        lines.push(`  [*] --> ${id}`);
      }
      if (state.kind === "error") {
        lines.push(`  state ${id} <<error>>`);
      }
    }

    for (const t of machine.transitions) {
      const fromId = t.from.replace(/[^a-zA-Z0-9_]/g, "_");
      const toId = t.to.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`  ${fromId} --> ${toId} : ${t.trigger}`);
    }

    for (const state of machine.states) {
      const id = state.name.replace(/[^a-zA-Z0-9_]/g, "_");
      if (state.kind === "terminal") {
        lines.push(`  ${id} --> [*]`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// --- Helpers ---

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !["node_modules", "dist", "coverage"].includes(entry.name)) {
      results.push(...findTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      results.push(full);
    }
  }
  return results;
}

// --- CLI ---

if (process.argv[1]?.endsWith("state-machine.ts")) {
  const args = process.argv.slice(2);
  const formatIdx = args.indexOf("--format");
  const format = formatIdx !== -1 ? args[formatIdx + 1] ?? "ascii" : "ascii";
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");

  const machines = scanDirectory(rootDir);

  if (format === "mermaid") {
    console.log(formatMermaid(machines));
  } else {
    console.log(formatAscii(machines));
  }
}
