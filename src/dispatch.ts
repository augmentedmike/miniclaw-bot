/**
 * Dispatch System — autonomous cron-driven agent loop.
 *
 * A heartbeat (cron/timer) triggers a dispatch cycle:
 *   1. Clean stale locks
 *   2. Check concurrency cap
 *   3. Index kanban with QMD (optional)
 *   4. Select the best ready ticket
 *   5. Acquire lock → enrich context → run agent loop → release lock
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, execFileSync, spawn } from "node:child_process";
import { getMinicawHome, getActivePersonaHome, loadConfig } from "./config.js";
import {
  listTasks,
  getTask,
  checkTransitionGates,
  VALID_TRANSITIONS,
  type KanbanTask,
  type KanbanState,
  type Priority,
} from "./kanban.js";
import { runAgent } from "./agent.js";
import { createAuditLogTool, type AuditWriter } from "./tools/audit.js";
import type { MinicawConfig } from "./types.js";

// ── Lock directory ──────────────────────────────────────────────────

function getLockDir(): string {
  return path.join(getMinicawHome(), "dispatch", "locks");
}

export type LockInfo = {
  pid: number;
  taskId: number;
  startedAt: string;
};

export function acquireLock(taskId: number): void {
  const dir = getLockDir();
  fs.mkdirSync(dir, { recursive: true });
  const lockFile = path.join(dir, `${taskId}.lock`);
  if (fs.existsSync(lockFile)) {
    throw new Error(`Task #${taskId} is already locked`);
  }
  const info: LockInfo = {
    pid: process.pid,
    taskId,
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(lockFile, JSON.stringify(info), "utf8");
}

export function releaseLock(taskId: number): void {
  const lockFile = path.join(getLockDir(), `${taskId}.lock`);
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function cleanStaleLocks(): number {
  const dir = getLockDir();
  if (!fs.existsSync(dir)) return 0;

  let cleaned = 0;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".lock"));
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const info: LockInfo = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!isProcessAlive(info.pid)) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    } catch {
      // Malformed lock file — remove it
      fs.unlinkSync(filePath);
      cleaned++;
    }
  }
  return cleaned;
}

export function countActiveLocks(): number {
  const dir = getLockDir();
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith(".lock")).length;
}

export function getActiveLocks(): LockInfo[] {
  const dir = getLockDir();
  if (!fs.existsSync(dir)) return [];

  const locks: LockInfo[] = [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".lock"));
  for (const file of files) {
    try {
      const info: LockInfo = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      locks.push(info);
    } catch {
      // Skip malformed
    }
  }
  return locks;
}

function getLockedTaskIds(): Set<number> {
  return new Set(getActiveLocks().map((l) => l.taskId));
}

// ── Ticket selection ────────────────────────────────────────────────

const PRIORITY_RANK: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function selectNextTask(): KanbanTask | null {
  const lockedIds = getLockedTaskIds();
  const all = listTasks();

  // Phase 1: In-progress tasks with no active lock (resume interrupted work)
  const resumable = all.filter(
    (t) =>
      t.state === "in-progress" &&
      t.status !== "on-hold" &&
      t.status !== "blocked" &&
      !lockedIds.has(t.id),
  );

  if (resumable.length > 0) {
    return sortByDispatchPriority(resumable)[0]!;
  }

  // Phase 2: Backlog tasks that pass gates for in-progress
  const backlog = all.filter(
    (t) =>
      t.state === "backlog" &&
      t.status !== "on-hold" &&
      t.status !== "blocked" &&
      !lockedIds.has(t.id),
  );

  const ready: KanbanTask[] = [];
  for (const task of backlog) {
    try {
      const gates = checkTransitionGates(task.id, "in-progress");
      if (gates.ok) {
        ready.push(task);
      }
    } catch {
      // Skip tasks that error during gate check
    }
  }

  if (ready.length > 0) {
    return sortByDispatchPriority(ready)[0]!;
  }

  return null;
}

function sortByDispatchPriority(tasks: KanbanTask[]): KanbanTask[] {
  return [...tasks].sort((a, b) => {
    // Higher priority first
    const pa = PRIORITY_RANK[a.priority] ?? 2;
    const pb = PRIORITY_RANK[b.priority] ?? 2;
    if (pb !== pa) return pb - pa;

    // Soonest due date first (null = infinity)
    const da = a.due ? new Date(a.due).getTime() : Infinity;
    const db = b.due ? new Date(b.due).getTime() : Infinity;
    if (da !== db) return da - db;

    // Oldest created first
    const ca = new Date(a.created).getTime();
    const cb = new Date(b.created).getTime();
    return ca - cb;
  });
}

// ── QMD integration ─────────────────────────────────────────────────

function isQmdInstalled(): boolean {
  try {
    execSync("which qmd", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const KANBAN_COLLECTION = "miniclaw-kanban";

export function ensureKanbanCollection(): void {
  const status = execFileSync("qmd", ["collection", "list"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (status.includes(KANBAN_COLLECTION)) return;

  const kanbanDir = path.join(getActivePersonaHome(), "kanban");
  fs.mkdirSync(kanbanDir, { recursive: true });
  execFileSync(
    "qmd",
    ["collection", "add", kanbanDir, "--name", KANBAN_COLLECTION],
    { stdio: "pipe" },
  );
}

export function indexKanban(): void {
  execFileSync("qmd", ["update"], { stdio: "pipe", timeout: 15_000 });
  const child = spawn("qmd", ["embed"], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

export type QmdSearchResult = {
  file: string;
  line: number;
  snippet: string;
  score?: number;
};

export function searchRelatedTickets(
  query: string,
  maxResults: number = 5,
): QmdSearchResult[] {
  const result = execFileSync(
    "qmd",
    ["vsearch", query, "-n", String(maxResults), "-c", KANBAN_COLLECTION, "--json"],
    { encoding: "utf8", stdio: "pipe", timeout: 30_000 },
  );
  return parseQmdJson(result);
}

function searchMemoryCollection(
  query: string,
  maxResults: number = 5,
): QmdSearchResult[] {
  try {
    const result = execFileSync(
      "qmd",
      ["vsearch", query, "-n", String(maxResults), "-c", "miniclaw-memory", "--json"],
      { encoding: "utf8", stdio: "pipe", timeout: 30_000 },
    );
    return parseQmdJson(result);
  } catch {
    return [];
  }
}

function parseQmdJson(raw: string): QmdSearchResult[] {
  const trimmed = raw.trim();
  if (!trimmed || (!trimmed.startsWith("[") && !trimmed.startsWith("{"))) return [];
  const data = JSON.parse(trimmed);
  const items = Array.isArray(data) ? data : (data.results ?? []);
  return items.map((item: Record<string, unknown>) => ({
    file: (item.path ?? item.file ?? item.docid ?? "unknown") as string,
    line: (item.line ?? 0) as number,
    snippet: (item.snippet ?? item.content ?? item.text ?? "") as string,
    score: item.score as number | undefined,
  }));
}

// ── Context enrichment ──────────────────────────────────────────────

export function buildDispatchContext(task: KanbanTask, useQmd: boolean): string {
  if (!useQmd) return "";

  const query = `${task.title} ${task.body.slice(0, 200)}`;
  const sections: string[] = [];

  try {
    const related = searchRelatedTickets(query);
    if (related.length > 0) {
      sections.push("### Related Tickets");
      for (const r of related) {
        sections.push(`- ${r.file}: ${r.snippet.slice(0, 120)}`);
      }
    }
  } catch {
    // QMD search failed — continue without
  }

  try {
    const memory = searchMemoryCollection(task.title);
    if (memory.length > 0) {
      sections.push("### Related Memory");
      for (const m of memory) {
        sections.push(`- ${m.file}: ${m.snippet.slice(0, 120)}`);
      }
    }
  } catch {
    // continue without
  }

  return sections.length > 0 ? sections.join("\n") : "";
}

// ── Audit log management ────────────────────────────────────────────

function getAuditDir(taskId: number): string {
  return path.join(getMinicawHome(), "dispatch", "logs", String(taskId));
}

export function createAuditWriter(taskId: number): AuditWriter {
  const dir = getAuditDir(taskId);
  fs.mkdirSync(dir, { recursive: true });
  const logFile = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);

  return (level: "info" | "warn" | "error", message: string) => {
    const entry = { at: new Date().toISOString(), level, message };
    fs.appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf8");
  };
}

export function getAuditLogs(taskId?: number): string[] {
  const baseDir = path.join(getMinicawHome(), "dispatch", "logs");
  if (!fs.existsSync(baseDir)) return [];

  if (taskId !== undefined) {
    const dir = getAuditDir(taskId);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .map((f) => path.join(dir, f));
  }

  // All task logs, sorted by modification time
  const logs: string[] = [];
  const taskDirs = fs.readdirSync(baseDir).filter((d) => {
    return fs.statSync(path.join(baseDir, d)).isDirectory();
  });
  for (const taskDir of taskDirs) {
    const dir = path.join(baseDir, taskDir);
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => path.join(dir, f));
    logs.push(...files);
  }
  return logs.sort();
}

// ── Dispatch prompt ─────────────────────────────────────────────────

function formatTaskDetail(t: KanbanTask): string {
  const lines: string[] = [
    `# #${t.id} ${t.title}`,
    `Project: ${t.project} | Type: ${t.type} | State: ${t.state}`,
    `Priority: ${t.priority} | Size: ${t.size} | Status: ${t.status}`,
  ];
  if (t.due) lines.push(`Due: ${t.due}`);
  if (t.parent) lines.push(`Epic: #${t.parent}`);
  if (t.blocked_by.length > 0) lines.push(`Blocked by: ${t.blocked_by.map((b) => "#" + b).join(", ")}`);
  lines.push(`Created: ${t.created}`);
  lines.push(`Updated: ${t.updated}`);
  if (t.body) lines.push("", "---", t.body);
  return lines.join("\n");
}

function buildDispatchPrompt(task: KanbanTask, contextSection: string): string {
  const nextStates = VALID_TRANSITIONS[task.state] ?? [];
  const nextState = nextStates.find((s) => s !== "backlog") ?? nextStates[0] ?? "in-review";

  let gateInfo = "";
  try {
    const gates = checkTransitionGates(task.id, nextState as KanbanState);
    if (gates.ok) {
      gateInfo = `Gates for ${task.state} → ${nextState}: All passing.`;
    } else {
      gateInfo = `Gates for ${task.state} → ${nextState}:\n${gates.violations.map((v) => `- ${v.message}`).join("\n")}`;
    }
  } catch {
    gateInfo = `Gate check unavailable for ${task.state} → ${nextState}.`;
  }

  const lines = [
    `You are an autonomous dispatch agent working on ticket #${task.id}: ${task.title}`,
    "",
    "## Ticket",
    formatTaskDetail(task),
    "",
  ];

  if (contextSection) {
    lines.push("## Related Context", contextSection, "");
  }

  lines.push(
    "## Column Transition Rules",
    gateInfo,
    "",
    `Use \`kanban_check #${task.id} ${nextState}\` to preview. Gate errors are your cues.`,
    `Use \`kanban_move #${task.id} ${nextState}\` to transition when ready.`,
    "",
    "## Instructions",
    `1. Review the ticket — understand problem, research, plan, acceptance criteria`,
    `2. Execute the implementation plan step by step`,
    `3. Log progress with audit_log as you work`,
    `4. When acceptance criteria are met and gates pass, move the ticket forward`,
    `5. If you can't finish, use kanban_note #${task.id} to record progress for next run`,
  );

  return lines.join("\n");
}

// ── Agent loop ──────────────────────────────────────────────────────

export async function runDispatchLoop(
  task: KanbanTask,
  config: MinicawConfig,
): Promise<void> {
  const writer = createAuditWriter(task.id);
  writer("info", `Dispatch started for #${task.id}: ${task.title}`);

  const useQmd = isQmdInstalled();
  if (useQmd) {
    try {
      ensureKanbanCollection();
      indexKanban();
      writer("info", "QMD kanban collection indexed");
    } catch (err) {
      writer("warn", `QMD indexing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    writer("info", "QMD not installed — skipping context enrichment");
  }

  const contextSection = buildDispatchContext(task, useQmd);
  const userMessage = buildDispatchPrompt(task, contextSection);

  const maxSteps = config.dispatchMaxSteps ?? 50;
  const agentConfig: MinicawConfig = {
    ...config,
    maxSteps,
    jailDir: config.dispatchWorkDir ?? config.jailDir,
  };

  const auditTool = createAuditLogTool(writer);

  try {
    const result = await runAgent(
      [{ role: "user", content: userMessage }],
      agentConfig,
      {
        channel: "dispatch",
        extraTools: { audit_log: auditTool },
        onToolCall: (name, _args) => {
          writer("info", `Tool call: ${name}`);
        },
      },
    );
    writer("info", `Dispatch completed. Agent response length: ${result.text.length}`);
  } catch (err) {
    writer("error", `Agent loop failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// ── Main dispatch cycle ─────────────────────────────────────────────

export async function runDispatchCycle(config?: MinicawConfig): Promise<void> {
  const cfg = config ?? loadConfig();
  const maxConcurrent = cfg.dispatchMaxConcurrent ?? 1;

  // Step 1: Clean stale locks
  const cleaned = cleanStaleLocks();
  if (cleaned > 0) {
    console.error(`[dispatch] Cleaned ${cleaned} stale lock(s)`);
  }

  // Step 2: Check concurrency cap
  const active = countActiveLocks();
  if (active >= maxConcurrent) {
    console.error(`[dispatch] At concurrency cap (${active}/${maxConcurrent}). Exiting.`);
    return;
  }

  // Step 3: Select best ticket
  const task = selectNextTask();
  if (!task) {
    console.error("[dispatch] No ready tasks found. Exiting.");
    return;
  }

  console.error(`[dispatch] Selected #${task.id}: ${task.title} (${task.priority}, ${task.state})`);

  // Step 4: Acquire lock
  try {
    acquireLock(task.id);
  } catch (err) {
    console.error(`[dispatch] Lock failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // Step 5: Run agent loop
  try {
    await runDispatchLoop(task, cfg);
  } catch (err) {
    console.error(`[dispatch] Agent loop error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    releaseLock(task.id);
  }
}
