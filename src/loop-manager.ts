/**
 * loop-manager.ts — Active agent loop tracking.
 *
 * Stores/reads ~/.miniclaw/run/active-loops.json
 * Used by: handler.ts (/activity), heartbeat (idempotency), kanban-ui (indicator)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type LoopPhase =
  | "starting"
  | "reading"
  | "researching"
  | "planning"
  | "writing"
  | "moving"
  | "done"
  | "failed";

export type ActiveLoop = {
  ticketId: number;
  ticketTitle: string;
  sessionKey: string;
  startedAt: string;      // ISO
  lastActivity: string;   // ISO
  phase: LoopPhase;
  notes: string;          // last status line from agent
};

export type LoopStore = {
  loops: ActiveLoop[];
  updated: string;        // ISO
};

function loopsPath(): string {
  // Respect MINICLAW_HOME if set, else default
  const home = process.env.MINICLAW_HOME ?? path.join(os.homedir(), ".miniclaw");
  const runDir = path.join(home, "run");
  fs.mkdirSync(runDir, { recursive: true });
  return path.join(runDir, "active-loops.json");
}

export function readLoops(): LoopStore {
  const p = loopsPath();
  if (!fs.existsSync(p)) return { loops: [], updated: new Date().toISOString() };
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as LoopStore;
  } catch {
    return { loops: [], updated: new Date().toISOString() };
  }
}

function writeLoops(store: LoopStore): void {
  store.updated = new Date().toISOString();
  fs.writeFileSync(loopsPath(), JSON.stringify(store, null, 2), "utf8");
}

/** Register a new loop. Idempotent — if ticketId already exists, update it. */
export function upsertLoop(loop: Omit<ActiveLoop, "lastActivity"> & { lastActivity?: string }): void {
  const store = readLoops();
  const now = new Date().toISOString();
  const existing = store.loops.findIndex(l => l.ticketId === loop.ticketId);
  const entry: ActiveLoop = { lastActivity: now, ...loop };
  if (existing >= 0) {
    store.loops[existing] = entry;
  } else {
    store.loops.push(entry);
  }
  writeLoops(store);
}

/** Update phase/notes for an existing loop. */
export function updateLoop(ticketId: number, patch: Partial<Pick<ActiveLoop, "phase" | "notes" | "lastActivity">>): void {
  const store = readLoops();
  const idx = store.loops.findIndex(l => l.ticketId === ticketId);
  if (idx < 0) return;
  store.loops[idx] = { ...store.loops[idx], lastActivity: new Date().toISOString(), ...patch };
  writeLoops(store);
}

/** Remove a loop (on completion or failure). */
export function removeLoop(ticketId: number): void {
  const store = readLoops();
  store.loops = store.loops.filter(l => l.ticketId !== ticketId);
  writeLoops(store);
}

/** Check if a loop is active for a given ticket. */
export function isLoopActive(ticketId: number): boolean {
  return readLoops().loops.some(l => l.ticketId === ticketId);
}

// ── Dispatch log ──────────────────────────────────────────────────────────

export type DispatchEntry = {
  ticketId: number;
  ticketTitle: string;
  action: "queued" | "loop-started" | "loop-done" | "loop-failed" | "skipped";
  reason?: string;
  at: string;  // ISO
};

export type DispatchLog = {
  entries: DispatchEntry[];
  updated: string;
};

function dispatchLogPath(): string {
  const home = process.env.MINICLAW_HOME ?? path.join(os.homedir(), ".miniclaw");
  const runDir = path.join(home, "run");
  fs.mkdirSync(runDir, { recursive: true });
  return path.join(runDir, "dispatch-log.json");
}

export function readDispatchLog(limit = 50): DispatchLog {
  const p = dispatchLogPath();
  if (!fs.existsSync(p)) return { entries: [], updated: new Date().toISOString() };
  try {
    const log = JSON.parse(fs.readFileSync(p, "utf8")) as DispatchLog;
    log.entries = log.entries.slice(-limit);
    return log;
  } catch {
    return { entries: [], updated: new Date().toISOString() };
  }
}

export function logDispatch(entry: Omit<DispatchEntry, "at">): void {
  const p = dispatchLogPath();
  let log: DispatchLog = { entries: [], updated: "" };
  if (fs.existsSync(p)) {
    try { log = JSON.parse(fs.readFileSync(p, "utf8")); } catch { /**/ }
  }
  log.entries.push({ ...entry, at: new Date().toISOString() });
  // Keep last 200 entries
  if (log.entries.length > 200) log.entries = log.entries.slice(-200);
  log.updated = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(log, null, 2), "utf8");
}

/** Purge loops that haven't had activity in >30 minutes (likely died). */
export function purgeStaleLoops(maxAgeMs = 30 * 60 * 1000): number {
  const store = readLoops();
  const cutoff = Date.now() - maxAgeMs;
  const before = store.loops.length;
  store.loops = store.loops.filter(l => new Date(l.lastActivity).getTime() > cutoff);
  writeLoops(store);
  return before - store.loops.length;
}

/** Count active loops (excluding done/failed). */
export function activeLoopCount(): number {
  return readLoops().loops.filter(l => l.phase !== "done" && l.phase !== "failed").length;
}
