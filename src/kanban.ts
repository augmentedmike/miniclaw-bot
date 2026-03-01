import fs from "node:fs";
import path from "node:path";
import { getActivePersonaHome } from "./config.js";

// ── Types ──────────────────────────────────────────────────────────

export type KanbanState = "backlog" | "in-progress" | "in-review" | "shipped";
export type Priority = "low" | "medium" | "high" | "critical";
export type TaskType = "chore" | "bugfix" | "feature" | "epic" | "research";
export type TaskStatus = "active" | "on-hold" | "blocked";
export type TaskSize = "small" | "medium" | "large" | "xl";

export type TransitionEntry = {
  from: KanbanState;
  to: KanbanState;
  at: string;
};

export type KanbanTask = {
  id: number;
  title: string;
  project: string;
  type: TaskType;
  state: KanbanState;
  priority: Priority;
  status: TaskStatus;
  size: TaskSize;
  due: string | null;
  parent: number | null;
  blocked_by: number[];
  created: string;
  updated: string;
  history: TransitionEntry[];
  body: string;
};

export type BoardMeta = {
  nextId: number;
  created: string;
};

export type BoardSummaryResult = {
  counts: Record<KanbanState, number>;
  active: { id: number; title: string; status: TaskStatus }[];
  blocked: { id: number; title: string; blocked_by: number[] }[];
  due_soon: { id: number; title: string; due: string }[];
};

export type GateViolation = { code: string; message: string };
export type GateResult = { ok: boolean; violations: GateViolation[] };

// ── Constants ──────────────────────────────────────────────────────

export const STATES: KanbanState[] = ["backlog", "in-progress", "in-review", "shipped"];
export const TYPES: TaskType[] = ["chore", "bugfix", "feature", "epic", "research"];
export const SIZES: TaskSize[] = ["small", "medium", "large", "xl"];
export const STATUSES: TaskStatus[] = ["active", "on-hold", "blocked"];

export const VALID_TRANSITIONS: Record<KanbanState, KanbanState[]> = {
  "backlog": ["in-progress"],
  "in-progress": ["in-review", "backlog"],
  "in-review": ["shipped", "in-progress"],
  "shipped": [],
};

export const REQUIRED_SECTIONS = [
  "Problem / Work Summary",
  "Research Planning",
  "Implementation Plan",
  "Acceptance Criteria",
];

const STATE_ORDER: Record<KanbanState, number> = {
  backlog: 0,
  "in-progress": 1,
  "in-review": 2,
  shipped: 3,
};

// ── Validators ─────────────────────────────────────────────────────

export function validateTransition(from: KanbanState, to: KanbanState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isValidState(s: string): s is KanbanState {
  return STATES.includes(s as KanbanState);
}

export function isValidPriority(p: string): p is Priority {
  return ["low", "medium", "high", "critical"].includes(p);
}

export function isValidType(t: string): t is TaskType {
  return TYPES.includes(t as TaskType);
}

export function isValidSize(s: string): s is TaskSize {
  return SIZES.includes(s as TaskSize);
}

export function isValidStatus(s: string): s is TaskStatus {
  return STATUSES.includes(s as TaskStatus);
}

// ── Gate helpers ──────────────────────────────────────────────────

export function extractSection(body: string, heading: string): string | null {
  const marker = `## ${heading}`;
  const idx = body.indexOf(marker);
  if (idx === -1) return null;
  if (idx > 0 && body[idx - 1] !== "\n") return null;

  const contentStart = idx + marker.length;
  const nextSection = body.indexOf("\n## ", contentStart);
  let content = nextSection === -1
    ? body.slice(contentStart)
    : body.slice(contentStart, nextSection);

  // Strip HTML comments so template guides don't count as content
  content = content.replace(/<!--[\s\S]*?-->/g, "");

  return content.trim();
}

export function isSectionFilled(body: string, heading: string): boolean {
  const content = extractSection(body, heading);
  return content !== null && content.length > 0;
}

export function isForwardTransition(from: KanbanState, to: KanbanState): boolean {
  return STATE_ORDER[to] > STATE_ORDER[from];
}

// ── Path helpers ───────────────────────────────────────────────────

export function getKanbanDir(): string {
  return path.join(getActivePersonaHome(), "kanban");
}

function getMetaPath(): string {
  return path.join(getKanbanDir(), "_meta.json");
}

function stateDir(state: KanbanState): string {
  return path.join(getKanbanDir(), state);
}

// ── Slug ───────────────────────────────────────────────────────────

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function taskFilename(id: number, title: string): string {
  return `${String(id).padStart(3, "0")}-${slugify(title)}.md`;
}

// ── Init ───────────────────────────────────────────────────────────

export function initBoard(): void {
  for (const s of STATES) {
    fs.mkdirSync(stateDir(s), { recursive: true });
  }
  const metaPath = getMetaPath();
  if (!fs.existsSync(metaPath)) {
    const meta: BoardMeta = { nextId: 1, created: new Date().toISOString() };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
  }
  // Lazy archive: rotate shipped tickets older than 7 days
  try { archiveShipped(); } catch { /* non-fatal */ }
}

function readMeta(): BoardMeta {
  const metaPath = getMetaPath();
  if (!fs.existsSync(metaPath)) {
    initBoard();
  }
  return JSON.parse(fs.readFileSync(metaPath, "utf8")) as BoardMeta;
}

function writeMeta(meta: BoardMeta): void {
  fs.writeFileSync(getMetaPath(), JSON.stringify(meta, null, 2), "utf8");
}

// ── Frontmatter parser ─────────────────────────────────────────────

export function parseTaskFile(content: string): Omit<KanbanTask, "state"> {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error("Invalid task file: missing YAML frontmatter");
  }
  const yaml = fmMatch[1]!;
  const body = (fmMatch[2] ?? "").trim();

  const id = extractYamlNumber(yaml, "id");
  const title = extractYamlString(yaml, "title");
  const project = extractYamlString(yaml, "project");
  const type = extractYamlString(yaml, "type");
  const priority = extractYamlString(yaml, "priority");
  const status = extractYamlString(yaml, "status");
  const size = extractYamlString(yaml, "size");
  const due = extractYamlString(yaml, "due") || null;
  const parent = extractYamlNumber(yaml, "parent") ?? null;
  const blocked_by = extractYamlNumberArray(yaml, "blocked_by");
  const created = extractYamlString(yaml, "created");
  const updated = extractYamlString(yaml, "updated");
  const history = extractYamlHistory(yaml);

  if (id === undefined) throw new Error("Task file missing 'id' field");
  if (!title) throw new Error("Task file missing 'title' field");

  return {
    id,
    title,
    project: project || "default",
    type: isValidType(type) ? type : "chore",
    priority: isValidPriority(priority) ? priority : "medium",
    status: isValidStatus(status) ? status : "active",
    size: isValidSize(size) ? size : "medium",
    due: due === "null" ? null : due,
    parent,
    blocked_by,
    created: created || new Date().toISOString(),
    updated: updated || new Date().toISOString(),
    history,
    body,
  };
}

function extractYamlString(yaml: string, key: string): string {
  const m = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!m) return "";
  return m[1]!.replace(/^["']|["']$/g, "").trim();
}

function extractYamlNumber(yaml: string, key: string): number | undefined {
  const s = extractYamlString(yaml, key);
  if (!s || s === "null") return undefined;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
}

function extractYamlArray(yaml: string, key: string): string[] {
  const m = yaml.match(new RegExp(`^${key}:\\s*\\[(.*)\\]`, "m"));
  if (!m) return [];
  return m[1]!
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function extractYamlNumberArray(yaml: string, key: string): number[] {
  return extractYamlArray(yaml, key)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

function extractYamlHistory(yaml: string): TransitionEntry[] {
  const historyStart = yaml.indexOf("history:");
  if (historyStart === -1) return [];

  const historyBlock = yaml.slice(historyStart);
  const entries: TransitionEntry[] = [];
  const entryRegex = /-\s*\{\s*from:\s*(\S+),\s*to:\s*(\S+),\s*at:\s*"?([^"}\s]+)"?\s*\}/g;

  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(historyBlock)) !== null) {
    entries.push({
      from: match[1] as KanbanState,
      to: match[2] as KanbanState,
      at: match[3]!,
    });
  }
  return entries;
}

// ── Frontmatter serializer ─────────────────────────────────────────

export function formatTaskFile(task: KanbanTask): string {
  const historyYaml = task.history.length > 0
    ? "history:\n" + task.history.map((h) =>
      `  - { from: ${h.from}, to: ${h.to}, at: "${h.at}" }`,
    ).join("\n")
    : "history: []";

  const blockedByYaml = task.blocked_by.length > 0
    ? `[${task.blocked_by.join(", ")}]`
    : "[]";

  const frontmatter = [
    "---",
    `id: ${task.id}`,
    `title: ${task.title}`,
    `project: ${task.project}`,
    `type: ${task.type}`,
    `priority: ${task.priority}`,
    `status: ${task.status}`,
    `size: ${task.size}`,
    `due: ${task.due ?? "null"}`,
    `parent: ${task.parent ?? "null"}`,
    `blocked_by: ${blockedByYaml}`,
    `created: ${task.created}`,
    `updated: ${task.updated}`,
    historyYaml,
    "---",
  ].join("\n");

  return task.body
    ? `${frontmatter}\n\n${task.body}\n`
    : `${frontmatter}\n`;
}

// ── Default body template ──────────────────────────────────────────

function defaultBody(title: string): string {
  return `# ${title}

## Problem / Work Summary
<!--
Clearly describe the problem, bug, or work to be done.
Include why it matters (user impact, business value, tech debt cost).

GOOD: "Users on the free tier see a 500 error when uploading files > 5MB.
This affects ~200 daily users and generates support tickets. Root cause
is the upload middleware doesn't validate file size before streaming to S3."

BAD: "Upload is broken" or "Fix the thing from standup"
-->

## Research Planning
<!--
Document research done before starting: relevant docs, prior art, code
references, technical spikes. Shows the problem was investigated.

GOOD:
- Reviewed S3 multipart upload docs: https://docs.aws.amazon.com/...
- Found similar fix in PR #42 for download size limits
- Traced middleware stack in src/upload/handler.ts:L45-80

BAD: "Need to look into this" or left empty
-->

## Implementation Plan
<!--
Concrete steps: files to touch, approach to take, order of operations.
Forces thinking before coding and makes review easier.

GOOD:
1. Add file size check in src/upload/middleware.ts before S3 stream
2. Return 413 with message including the size limit
3. Add unit tests for boundary cases (exactly 5MB, 5MB+1, 0 bytes)
4. Update API docs in docs/upload.md

BAD: "Fix the upload code" or "Will figure it out as I go"
-->

## Acceptance Criteria
<!--
Specific, testable conditions that prove the work is done.
Defines "done" so review isn't subjective.

GOOD:
- [ ] Files > 5MB return 413 with message "File exceeds 5MB limit"
- [ ] Files <= 5MB upload successfully (regression test)
- [ ] Error is logged with file size and user ID
- [ ] API docs updated with size limit note

BAD: "It works" or "Upload is fixed"
-->
`;
}

// ── Computed status ────────────────────────────────────────────────

/**
 * Compute effective status. If blocked_by contains IDs of tasks
 * that aren't shipped, status is "blocked" regardless of stored value.
 */
function computeStatus(task: Omit<KanbanTask, "state">, allTasks?: KanbanTask[]): TaskStatus {
  if (task.blocked_by.length === 0) return task.status;
  if (!allTasks) return task.status;

  const hasUnresolved = task.blocked_by.some((depId) => {
    const dep = allTasks.find((t) => t.id === depId);
    return dep && dep.state !== "shipped";
  });

  return hasUnresolved ? "blocked" : task.status;
}

// ── File lookup ────────────────────────────────────────────────────

function findTaskFile(id: number): { filePath: string; state: KanbanState } | null {
  const prefix = String(id).padStart(3, "0") + "-";
  for (const s of STATES) {
    const dir = stateDir(s);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    const match = files.find((f) => f.startsWith(prefix) && f.endsWith(".md"));
    if (match) {
      return { filePath: path.join(dir, match), state: s };
    }
  }
  return null;
}

// ── CRUD ───────────────────────────────────────────────────────────

export type AddTaskOpts = {
  project?: string;
  type?: TaskType;
  priority?: Priority;
  size?: TaskSize;
  due?: string;
  parent?: number;
  blocked_by?: number[];
  body?: string;
};

export function addTask(title: string, opts?: AddTaskOpts): KanbanTask {
  initBoard();
  const meta = readMeta();
  const id = meta.nextId;
  const now = new Date().toISOString();

  const task: KanbanTask = {
    id,
    title,
    project: opts?.project ?? "default",
    type: opts?.type ?? "chore",
    state: "backlog",
    priority: opts?.priority ?? "medium",
    status: "active",
    size: opts?.size ?? "medium",
    due: opts?.due ?? null,
    parent: opts?.parent ?? null,
    blocked_by: opts?.blocked_by ?? [],
    created: now,
    updated: now,
    history: [],
    body: opts?.body ?? defaultBody(title),
  };

  const filename = taskFilename(id, title);
  const filePath = path.join(stateDir("backlog"), filename);
  fs.writeFileSync(filePath, formatTaskFile(task), "utf8");

  meta.nextId = id + 1;
  writeMeta(meta);

  return task;
}

export function getTask(id: number): KanbanTask | null {
  const found = findTaskFile(id);
  if (!found) return null;

  const content = fs.readFileSync(found.filePath, "utf8");
  const parsed = parseTaskFile(content);
  return { ...parsed, state: found.state };
}

export function checkTransitionGates(id: number, toState: KanbanState): GateResult {
  const task = getTask(id);
  if (!task) throw new Error(`Task #${id} not found`);

  const fromState = task.state;
  const violations: GateViolation[] = [];

  // Sendbacks always allowed
  if (!isForwardTransition(fromState, toState)) {
    return { ok: true, violations: [] };
  }

  // Blocker gate — all forward transitions
  for (const depId of task.blocked_by) {
    const dep = getTask(depId);
    if (!dep || dep.state !== "shipped") {
      violations.push({
        code: "blocked",
        message: `Task is blocked by #${depId} (${dep ? `in ${dep.state}` : "not found"})`,
      });
    }
  }

  // backlog → in-progress gates
  if (fromState === "backlog" && toState === "in-progress") {
    if (!task.title.trim()) {
      violations.push({ code: "empty_title", message: "Title is empty" });
    }
    if (task.project === "default") {
      violations.push({
        code: "default_project",
        message: 'Project is "default" — set an explicit project before starting work',
      });
    }
    for (const h of REQUIRED_SECTIONS) {
      if (!isSectionFilled(task.body, h)) {
        violations.push({
          code: "empty_section",
          message: `Section "${h}" is empty — fill it before starting work`,
        });
      }
    }
  }

  // in-review → shipped gates
  if (fromState === "in-review" && toState === "shipped") {
    if (task.type === "epic") {
      const children = getChildren(id);
      if (children.length === 0) {
        violations.push({
          code: "epic_no_children",
          message: "Epic has no child tasks — add at least one before shipping",
        });
      } else {
        const unshipped = children.filter((c) => c.state !== "shipped");
        if (unshipped.length > 0) {
          violations.push({
            code: "epic_unshipped_children",
            message: `Epic has ${unshipped.length} unshipped child task(s): ${unshipped.map((c) => `#${c.id}`).join(", ")}`,
          });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

export function moveTask(id: number, toState: KanbanState): KanbanTask {
  const found = findTaskFile(id);
  if (!found) throw new Error(`Task #${id} not found`);

  const fromState = found.state;
  if (fromState === toState) {
    throw new Error(`Task #${id} is already in ${toState}`);
  }
  if (!validateTransition(fromState, toState)) {
    const allowed = VALID_TRANSITIONS[fromState];
    throw new Error(
      `Invalid transition: ${fromState} → ${toState}. ` +
      `Allowed from ${fromState}: ${allowed.length > 0 ? allowed.join(", ") : "(none — terminal state)"}`,
    );
  }

  // Gate enforcement
  const gateResult = checkTransitionGates(id, toState);
  if (!gateResult.ok) {
    const lines = [`Cannot move #${id} to ${toState}:`];
    for (const v of gateResult.violations) {
      lines.push(`- ${v.message}`);
    }
    throw new Error(lines.join("\n"));
  }

  const content = fs.readFileSync(found.filePath, "utf8");
  const parsed = parseTaskFile(content);
  const now = new Date().toISOString();

  const task: KanbanTask = {
    ...parsed,
    state: toState,
    updated: now,
    history: [...parsed.history, { from: fromState, to: toState, at: now }],
  };

  // Move file
  const filename = path.basename(found.filePath);
  const destDir = stateDir(toState);
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, filename);

  fs.writeFileSync(destPath, formatTaskFile(task), "utf8");
  fs.unlinkSync(found.filePath);

  return task;
}

export type EditTaskUpdates = {
  title?: string;
  project?: string;
  type?: TaskType;
  priority?: Priority;
  status?: TaskStatus;
  size?: TaskSize;
  due?: string | null;
  parent?: number | null;
  blocked_by?: number[];
};

export function editTask(id: number, updates: EditTaskUpdates): KanbanTask {
  const found = findTaskFile(id);
  if (!found) throw new Error(`Task #${id} not found`);

  const content = fs.readFileSync(found.filePath, "utf8");
  const parsed = parseTaskFile(content);
  const now = new Date().toISOString();

  const task: KanbanTask = {
    ...parsed,
    state: found.state,
    title: updates.title ?? parsed.title,
    project: updates.project ?? parsed.project,
    type: updates.type ?? parsed.type,
    priority: updates.priority ?? parsed.priority,
    status: updates.status ?? parsed.status,
    size: updates.size ?? parsed.size,
    due: updates.due !== undefined ? updates.due : parsed.due,
    parent: updates.parent !== undefined ? updates.parent : parsed.parent,
    blocked_by: updates.blocked_by ?? parsed.blocked_by,
    updated: now,
  };

  // If title changed, rename the file
  if (updates.title && updates.title !== parsed.title) {
    const newFilename = taskFilename(task.id, task.title);
    const newPath = path.join(stateDir(found.state), newFilename);
    fs.writeFileSync(newPath, formatTaskFile(task), "utf8");
    fs.unlinkSync(found.filePath);
  } else {
    fs.writeFileSync(found.filePath, formatTaskFile(task), "utf8");
  }

  return task;
}

export function appendNote(id: number, note: string): KanbanTask {
  const found = findTaskFile(id);
  if (!found) throw new Error(`Task #${id} not found`);

  const content = fs.readFileSync(found.filePath, "utf8");
  const parsed = parseTaskFile(content);
  const now = new Date().toISOString();

  const task: KanbanTask = {
    ...parsed,
    state: found.state,
    updated: now,
    body: parsed.body
      ? `${parsed.body}\n\n${note}`
      : note,
  };

  fs.writeFileSync(found.filePath, formatTaskFile(task), "utf8");
  return task;
}

export function listTasks(state?: KanbanState): KanbanTask[] {
  initBoard();
  const states = state ? [state] : STATES;
  const tasks: KanbanTask[] = [];

  for (const s of states) {
    const dir = stateDir(s);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), "utf8");
        const parsed = parseTaskFile(content);
        tasks.push({ ...parsed, state: s });
      } catch {
        // Skip malformed files
      }
    }
  }

  // Compute blocked status based on dependencies
  for (const task of tasks) {
    task.status = computeStatus(task, tasks);
  }

  return tasks;
}

export function taskHistory(id: number): TransitionEntry[] {
  const task = getTask(id);
  if (!task) throw new Error(`Task #${id} not found`);
  return task.history;
}

/**
 * Get children of an epic.
 */
export function getChildren(parentId: number): KanbanTask[] {
  return listTasks().filter((t) => t.parent === parentId);
}

export function boardSummary(): BoardSummaryResult {
  const tasks = listTasks();
  const counts: Record<KanbanState, number> = {
    "backlog": 0,
    "in-progress": 0,
    "in-review": 0,
    "shipped": 0,
  };

  const active: BoardSummaryResult["active"] = [];
  const blocked: BoardSummaryResult["blocked"] = [];
  const due_soon: BoardSummaryResult["due_soon"] = [];

  const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;

  for (const task of tasks) {
    counts[task.state]++;

    if (task.state === "in-progress") {
      active.push({ id: task.id, title: task.title, status: task.status });
    }

    if (task.status === "blocked" && task.state !== "shipped") {
      blocked.push({ id: task.id, title: task.title, blocked_by: task.blocked_by });
    }

    if (task.due && task.state !== "shipped") {
      const dueTime = new Date(task.due).getTime();
      if (dueTime <= weekFromNow) {
        due_soon.push({ id: task.id, title: task.title, due: task.due });
      }
    }
  }

  // Sort due_soon by date
  due_soon.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  return { counts, active, blocked, due_soon };
}

/**
 * Format board summary for system prompt injection.
 * Returns empty string if no tasks exist.
 */
export function boardSummaryText(): string {
  try {
    const { counts, active, blocked, due_soon } = boardSummary();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return "";

    const lines: string[] = [
      "## Current Tasks",
      `Backlog: ${counts["backlog"]} | In Progress: ${counts["in-progress"]} | In Review: ${counts["in-review"]} | Shipped: ${counts["shipped"]}`,
    ];

    if (active.length > 0) {
      const activeItems = active.map((t) => {
        const flag = t.status !== "active" ? ` [${t.status}]` : "";
        return `#${t.id} ${t.title}${flag}`;
      });
      lines.push(`Active: ${activeItems.join(", ")}`);
    }

    if (blocked.length > 0) {
      lines.push(`Blocked: ${blocked.map((t) => `#${t.id} ${t.title} (by ${t.blocked_by.map((b) => "#" + b).join(", ")})`).join(", ")}`);
    }

    if (due_soon.length > 0) {
      lines.push(`Due soon: ${due_soon.map((t) => `#${t.id} ${t.title} (${t.due})`).join(", ")}`);
    }

    return lines.join("\n");
  } catch {
    return "";
  }
}

// ── Archive ────────────────────────────────────────────────────────

const ARCHIVE_AFTER_DAYS = 7;

function archiveDir(): string {
  return path.join(getKanbanDir(), "archive");
}

/**
 * Move shipped tasks older than `days` to archive/.
 * Returns the list of archived tasks.
 */
export function archiveShipped(days: number = ARCHIVE_AFTER_DAYS): KanbanTask[] {
  const shippedDir = stateDir("shipped");
  if (!fs.existsSync(shippedDir)) return [];

  fs.mkdirSync(archiveDir(), { recursive: true });
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const archived: KanbanTask[] = [];

  const files = fs.readdirSync(shippedDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const filePath = path.join(shippedDir, file);
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const parsed = parseTaskFile(content);
      const updatedTime = new Date(parsed.updated).getTime();
      if (updatedTime < cutoff) {
        fs.renameSync(filePath, path.join(archiveDir(), file));
        archived.push({ ...parsed, state: "shipped" });
      }
    } catch {
      // Skip malformed files
    }
  }

  return archived;
}

// ── Search ─────────────────────────────────────────────────────────

export function searchTasks(query: string): KanbanTask[] {
  const all = listTasks();
  const q = query.toLowerCase();
  return all.filter((t) =>
    t.title.toLowerCase().includes(q) ||
    t.body.toLowerCase().includes(q) ||
    t.project.toLowerCase().includes(q) ||
    t.type.includes(q),
  );
}
