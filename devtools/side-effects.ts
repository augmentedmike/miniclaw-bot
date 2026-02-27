/**
 * Side-effect tracer.
 *
 * Classifies every exported function as pure or impure.
 * Impure functions are tagged with which side effects they use:
 *   fs, network, process, console, random, date, mutation
 *
 * Helps push toward "functional core, imperative shell" architecture.
 *
 * Usage:
 *   npx tsx devtools/side-effects.ts [--root src/]
 */

import fs from "node:fs";
import path from "node:path";

export type SideEffect =
  | "fs"
  | "network"
  | "process"
  | "console"
  | "random"
  | "date"
  | "mutation"
  | "child_process"
  | "env";

export type FunctionPurity = {
  file: string;
  name: string;
  line: number;
  pure: boolean;
  effects: SideEffect[];
};

const EFFECT_PATTERNS: Array<{ pattern: RegExp; effect: SideEffect }> = [
  // Filesystem
  { pattern: /\bfs\.\w+/g, effect: "fs" },
  { pattern: /\breadFileSync\b|\bwriteFileSync\b|\bexistsSync\b|\breaddirSync\b|\bmkdirSync\b|\brmSync\b|\bstatSync\b|\bunlinkSync\b/g, effect: "fs" },
  { pattern: /\bfs\/promises\b/g, effect: "fs" },

  // Network
  { pattern: /\bfetch\s*\(/g, effect: "network" },
  { pattern: /\bhttp\.\w+|https\.\w+/g, effect: "network" },
  { pattern: /\baxios\b|\bgot\b|\bnode-fetch\b/g, effect: "network" },

  // Process
  { pattern: /\bprocess\.exit\b/g, effect: "process" },
  { pattern: /\bprocess\.argv\b/g, effect: "process" },
  { pattern: /\bprocess\.cwd\b/g, effect: "process" },

  // Environment
  { pattern: /\bprocess\.env\b/g, effect: "env" },

  // Console
  { pattern: /\bconsole\.\w+\s*\(/g, effect: "console" },

  // Randomness
  { pattern: /\bMath\.random\b/g, effect: "random" },
  { pattern: /\bcrypto\.random\w+/g, effect: "random" },

  // Date/time (non-deterministic)
  { pattern: /\bnew\s+Date\b/g, effect: "date" },
  { pattern: /\bDate\.now\b/g, effect: "date" },

  // Child process
  { pattern: /\bspawn\s*\(|\bexec\s*\(|\bexecFile\s*\(|\bexecSync\s*\(/g, effect: "child_process" },

  // External mutation (global/shared state)
  { pattern: /\bthis\.\w+\s*=/g, effect: "mutation" },
];

const FUNC_RE = /export\s+(?:async\s+)?function\s+(\w+)/g;
const ARROW_RE = /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(/g;

export function analyzePurity(content: string, fileName: string): FunctionPurity[] {
  const results: FunctionPurity[] = [];

  for (const re of [FUNC_RE, ARROW_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1]!;
      const line = content.slice(0, m.index).split("\n").length;
      const bodyStart = content.indexOf("{", m.index + m[0].length);
      if (bodyStart === -1) continue;

      // Match braces
      let depth = 1;
      let pos = bodyStart + 1;
      while (pos < content.length && depth > 0) {
        if (content[pos] === "{") depth++;
        else if (content[pos] === "}") depth--;
        pos++;
      }
      const body = content.slice(bodyStart, pos);

      const effects = new Set<SideEffect>();
      for (const { pattern, effect } of EFFECT_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(body)) {
          effects.add(effect);
        }
      }

      results.push({
        file: fileName,
        name,
        line,
        pure: effects.size === 0,
        effects: [...effects],
      });
    }
  }

  return results;
}

export function formatReport(rootDir: string): string {
  const files = findTsFiles(rootDir);
  const allFunctions: FunctionPurity[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(rootDir, file);
    allFunctions.push(...analyzePurity(content, rel));
  }

  const lines: string[] = [];
  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║           SIDE-EFFECT TRACE                     ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  const pure = allFunctions.filter((f) => f.pure);
  const impure = allFunctions.filter((f) => !f.pure);

  if (impure.length > 0) {
    lines.push("IMPURE FUNCTIONS (have side effects):");
    lines.push("─".repeat(70));

    // Group by file
    const byFile = new Map<string, FunctionPurity[]>();
    for (const f of impure) {
      if (!byFile.has(f.file)) byFile.set(f.file, []);
      byFile.get(f.file)!.push(f);
    }

    for (const [file, fns] of [...byFile.entries()].sort()) {
      lines.push(`  ${file}:`);
      for (const fn of fns) {
        const tags = fn.effects.map((e) => `[${e}]`).join(" ");
        lines.push(`    ${fn.name}:${fn.line}  ${tags}`);
      }
    }
    lines.push("");
  }

  if (pure.length > 0) {
    lines.push("PURE FUNCTIONS (no side effects):");
    lines.push("─".repeat(70));
    for (const fn of pure) {
      lines.push(`  ✓ ${fn.file}:${fn.line}  ${fn.name}`);
    }
    lines.push("");
  }

  // Summary
  const total = allFunctions.length;
  const pureRatio = total > 0 ? ((pure.length / total) * 100).toFixed(0) : "0";
  lines.push(`Total: ${total} functions, ${pure.length} pure (${pureRatio}%), ${impure.length} impure`);

  // Effect frequency
  const effectCounts = new Map<SideEffect, number>();
  for (const fn of impure) {
    for (const e of fn.effects) {
      effectCounts.set(e, (effectCounts.get(e) ?? 0) + 1);
    }
  }
  if (effectCounts.size > 0) {
    lines.push("Effect frequency: " + [...effectCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([e, c]) => `${e}(${c})`)
      .join(", "));
  }

  return lines.join("\n");
}

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

if (process.argv[1]?.endsWith("side-effects.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  console.log(formatReport(rootDir));
}
