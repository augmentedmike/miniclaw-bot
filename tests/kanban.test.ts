import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** Body content that satisfies all backlog→in-progress section gates */
function readyBody(title: string): string {
  return [
    `# ${title}`,
    "",
    "## Problem / Work Summary",
    "",
    "Description of the work to be done.",
    "",
    "## Research Planning",
    "",
    "Research references and planning notes.",
    "",
    "## Implementation Plan",
    "",
    "Step-by-step implementation approach.",
    "",
    "## Acceptance Criteria",
    "",
    "- Criterion met.",
    "",
  ].join("\n");
}

/** Create addTask opts that satisfy all backlog→in-progress gates */
function readyOpts(title: string, extra?: Record<string, unknown>) {
  return { project: "testproject", body: readyBody(title), ...extra };
}

describe("kanban", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-kanban-"));
    process.env.MINICLAW_HOME = tmpDir;

    // Create persona structure so getActivePersonaHome resolves
    fs.mkdirSync(path.join(tmpDir, "user", "personas", "default", "kanban"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "user", "active-persona"), "default", "utf8");
  });

  afterEach(() => {
    delete process.env.MINICLAW_HOME;
    vi.resetModules();
  });

  // ── Parsing ────────────────────────────────────────────────────────

  it("parseTaskFile extracts all frontmatter fields", async () => {
    const { parseTaskFile } = await import("@src/kanban.js");
    const content = `---
id: 5
title: Setup CI pipeline
project: infra
type: feature
priority: high
status: active
size: large
due: 2026-03-15
parent: 2
blocked_by: [3, 4]
created: 2026-02-28T16:00:00Z
updated: 2026-02-28T18:30:00Z
history:
  - { from: backlog, to: in-progress, at: "2026-02-28T17:00:00Z" }
  - { from: in-progress, to: in-review, at: "2026-02-28T18:00:00Z" }
---

# Setup CI pipeline

## Problem / Work Summary

GitHub Actions workflow for test + build + deploy.`;

    const task = parseTaskFile(content);
    expect(task.id).toBe(5);
    expect(task.title).toBe("Setup CI pipeline");
    expect(task.project).toBe("infra");
    expect(task.type).toBe("feature");
    expect(task.priority).toBe("high");
    expect(task.status).toBe("active");
    expect(task.size).toBe("large");
    expect(task.due).toBe("2026-03-15");
    expect(task.parent).toBe(2);
    expect(task.blocked_by).toEqual([3, 4]);
    expect(task.history).toHaveLength(2);
    expect(task.body).toContain("GitHub Actions");
  });

  it("parseTaskFile applies defaults for missing optional fields", async () => {
    const { parseTaskFile } = await import("@src/kanban.js");
    const content = `---
id: 1
title: Minimal task
created: 2026-02-28T10:00:00Z
updated: 2026-02-28T10:00:00Z
history: []
---
`;
    const task = parseTaskFile(content);
    expect(task.project).toBe("default");
    expect(task.type).toBe("chore");
    expect(task.priority).toBe("medium");
    expect(task.status).toBe("active");
    expect(task.size).toBe("medium");
    expect(task.due).toBeNull();
    expect(task.parent).toBeNull();
    expect(task.blocked_by).toEqual([]);
  });

  it("parseTaskFile rejects missing frontmatter", async () => {
    const { parseTaskFile } = await import("@src/kanban.js");
    expect(() => parseTaskFile("no frontmatter here")).toThrow("missing YAML frontmatter");
  });

  it("parseTaskFile rejects missing id", async () => {
    const { parseTaskFile } = await import("@src/kanban.js");
    const content = `---\ntitle: oops\n---\nBody`;
    expect(() => parseTaskFile(content)).toThrow("missing 'id'");
  });

  // ── Serialization round-trip ──────────────────────────────────────

  it("formatTaskFile → parseTaskFile round-trips", async () => {
    const { formatTaskFile, parseTaskFile } = await import("@src/kanban.js");
    const task = {
      id: 42,
      title: "Test round trip",
      project: "myproject",
      type: "feature" as const,
      state: "in-progress" as const,
      priority: "high" as const,
      status: "active" as const,
      size: "large" as const,
      due: "2026-03-20",
      parent: 10,
      blocked_by: [5, 8],
      created: "2026-02-28T10:00:00Z",
      updated: "2026-02-28T11:00:00Z",
      history: [{ from: "backlog" as const, to: "in-progress" as const, at: "2026-02-28T10:30:00Z" }],
      body: "# Test round trip\n\n## Problem / Work Summary\n\nSome notes here.",
    };

    const serialized = formatTaskFile(task);
    const parsed = parseTaskFile(serialized);

    expect(parsed.id).toBe(42);
    expect(parsed.title).toBe("Test round trip");
    expect(parsed.project).toBe("myproject");
    expect(parsed.type).toBe("feature");
    expect(parsed.priority).toBe("high");
    expect(parsed.size).toBe("large");
    expect(parsed.due).toBe("2026-03-20");
    expect(parsed.parent).toBe(10);
    expect(parsed.blocked_by).toEqual([5, 8]);
    expect(parsed.history).toHaveLength(1);
    expect(parsed.body).toContain("Some notes here.");
  });

  // ── State machine ────────────────────────────────────────────────

  it("validates legal transitions", async () => {
    const { validateTransition } = await import("@src/kanban.js");
    expect(validateTransition("backlog", "in-progress")).toBe(true);
    expect(validateTransition("in-progress", "in-review")).toBe(true);
    expect(validateTransition("in-progress", "backlog")).toBe(true);
    expect(validateTransition("in-review", "shipped")).toBe(true);
    expect(validateTransition("in-review", "in-progress")).toBe(true);
  });

  it("rejects illegal transitions", async () => {
    const { validateTransition } = await import("@src/kanban.js");
    expect(validateTransition("backlog", "shipped")).toBe(false);
    expect(validateTransition("backlog", "in-review")).toBe(false);
    expect(validateTransition("shipped", "backlog")).toBe(false);
    expect(validateTransition("shipped", "in-progress")).toBe(false);
    expect(validateTransition("in-review", "backlog")).toBe(false);
  });

  it("shipped is terminal — no transitions allowed", async () => {
    const { validateTransition, STATES } = await import("@src/kanban.js");
    for (const s of STATES) {
      expect(validateTransition("shipped", s)).toBe(false);
    }
  });

  // ── CRUD ─────────────────────────────────────────────────────────

  it("addTask creates a task in backlog with all fields", async () => {
    const { addTask, getTask } = await import("@src/kanban.js");
    const task = addTask("Fix auth bug", {
      project: "webapp",
      type: "bugfix",
      priority: "high",
      size: "small",
      due: "2026-03-01",
    });

    expect(task.id).toBe(1);
    expect(task.state).toBe("backlog");
    expect(task.title).toBe("Fix auth bug");
    expect(task.project).toBe("webapp");
    expect(task.type).toBe("bugfix");
    expect(task.priority).toBe("high");
    expect(task.size).toBe("small");
    expect(task.due).toBe("2026-03-01");
    expect(task.status).toBe("active");
    expect(task.body).toContain("## Problem / Work Summary");

    const retrieved = getTask(1);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe("Fix auth bug");
  });

  it("addTask increments ID", async () => {
    const { addTask } = await import("@src/kanban.js");
    const t1 = addTask("First");
    const t2 = addTask("Second");
    const t3 = addTask("Third");

    expect(t1.id).toBe(1);
    expect(t2.id).toBe(2);
    expect(t3.id).toBe(3);
  });

  it("moveTask transitions and records history", async () => {
    const { addTask, moveTask, getTask } = await import("@src/kanban.js");
    addTask("Movable task", readyOpts("Movable task"));

    const moved = moveTask(1, "in-progress");
    expect(moved.state).toBe("in-progress");
    expect(moved.history).toHaveLength(1);
    expect(moved.history[0]!.from).toBe("backlog");
    expect(moved.history[0]!.to).toBe("in-progress");

    const retrieved = getTask(1);
    expect(retrieved!.state).toBe("in-progress");
  });

  it("moveTask rejects invalid transitions", async () => {
    const { addTask, moveTask } = await import("@src/kanban.js");
    addTask("Cannot skip");

    expect(() => moveTask(1, "shipped")).toThrow("Invalid transition");
    expect(() => moveTask(1, "in-review")).toThrow("Invalid transition");
  });

  it("moveTask rejects moves from shipped", async () => {
    const { addTask, moveTask } = await import("@src/kanban.js");
    addTask("Will ship", readyOpts("Will ship"));
    moveTask(1, "in-progress");
    moveTask(1, "in-review");
    moveTask(1, "shipped");

    expect(() => moveTask(1, "backlog")).toThrow("Invalid transition");
    expect(() => moveTask(1, "in-progress")).toThrow("Invalid transition");
  });

  it("moveTask rejects same-state move", async () => {
    const { addTask, moveTask } = await import("@src/kanban.js");
    addTask("Stay put");
    expect(() => moveTask(1, "backlog")).toThrow("already in backlog");
  });

  it("moveTask rejects unknown task", async () => {
    const { moveTask } = await import("@src/kanban.js");
    expect(() => moveTask(999, "in-progress")).toThrow("not found");
  });

  // ── List / Board ─────────────────────────────────────────────────

  it("listTasks returns all tasks across states", async () => {
    const { addTask, moveTask, listTasks } = await import("@src/kanban.js");
    addTask("One");
    addTask("Two", readyOpts("Two"));
    addTask("Three");
    moveTask(2, "in-progress");

    const all = listTasks();
    expect(all).toHaveLength(3);

    const backlog = listTasks("backlog");
    expect(backlog).toHaveLength(2);

    const inProgress = listTasks("in-progress");
    expect(inProgress).toHaveLength(1);
    expect(inProgress[0]!.title).toBe("Two");
  });

  it("boardSummary counts by state and reports blocked/due", async () => {
    const { addTask, moveTask, boardSummary } = await import("@src/kanban.js");
    addTask("A", readyOpts("A", { due: "2026-03-01" }));
    addTask("B", readyOpts("B"));
    addTask("C", { blocked_by: [1] });
    moveTask(1, "in-progress");
    moveTask(2, "in-progress");
    moveTask(2, "in-review");

    const summary = boardSummary();
    expect(summary.counts["backlog"]).toBe(1);
    expect(summary.counts["in-progress"]).toBe(1);
    expect(summary.counts["in-review"]).toBe(1);
    expect(summary.active).toHaveLength(1);
    expect(summary.active[0]!.title).toBe("A");
    // C is blocked because it depends on #1 which is in-progress (not shipped)
    expect(summary.blocked).toHaveLength(1);
    expect(summary.blocked[0]!.title).toBe("C");
  });

  // ── Edit / Note / Status ─────────────────────────────────────────

  it("editTask updates all fields", async () => {
    const { addTask, editTask, getTask } = await import("@src/kanban.js");
    addTask("Original title");

    editTask(1, {
      title: "Updated title",
      project: "new-project",
      type: "feature",
      priority: "critical",
      status: "on-hold",
      size: "xl",
      due: "2026-04-01",
    });

    const task = getTask(1);
    expect(task!.title).toBe("Updated title");
    expect(task!.project).toBe("new-project");
    expect(task!.type).toBe("feature");
    expect(task!.priority).toBe("critical");
    expect(task!.status).toBe("on-hold");
    expect(task!.size).toBe("xl");
    expect(task!.due).toBe("2026-04-01");
  });

  it("appendNote adds to body", async () => {
    const { addTask, appendNote, getTask } = await import("@src/kanban.js");
    addTask("Noted task");

    appendNote(1, "First note.");
    appendNote(1, "Second note.");

    const task = getTask(1);
    expect(task!.body).toContain("First note.");
    expect(task!.body).toContain("Second note.");
  });

  // ── Blocked status computed ──────────────────────────────────────

  it("listTasks computes blocked status from unresolved dependencies", async () => {
    const { addTask, listTasks } = await import("@src/kanban.js");
    addTask("Dependency");             // #1, backlog
    addTask("Blocked task", { blocked_by: [1] });  // #2, backlog

    const tasks = listTasks();
    const blockedTask = tasks.find((t) => t.id === 2);
    expect(blockedTask!.status).toBe("blocked");
  });

  it("blocked status clears when dependency ships", async () => {
    const { addTask, moveTask, listTasks } = await import("@src/kanban.js");
    addTask("Dependency", readyOpts("Dependency"));
    addTask("Waiting", { blocked_by: [1] });

    moveTask(1, "in-progress");
    moveTask(1, "in-review");
    moveTask(1, "shipped");

    const tasks = listTasks();
    const waiting = tasks.find((t) => t.id === 2);
    expect(waiting!.status).toBe("active");
  });

  // ── Epic / Parent ────────────────────────────────────────────────

  it("getChildren returns tasks with matching parent", async () => {
    const { addTask, getChildren } = await import("@src/kanban.js");
    addTask("Epic task", { type: "epic" });
    addTask("Child 1", { parent: 1 });
    addTask("Child 2", { parent: 1 });
    addTask("Unrelated");

    const children = getChildren(1);
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.title)).toEqual(["Child 1", "Child 2"]);
  });

  // ── Search ───────────────────────────────────────────────────────

  it("searchTasks matches title, body, project, type", async () => {
    const { addTask, searchTasks } = await import("@src/kanban.js");
    addTask("Fix login bug", { project: "webapp", type: "bugfix" });
    addTask("Add dark mode", { project: "webapp", type: "feature" });
    addTask("Refactor auth module", { project: "api" });

    expect(searchTasks("webapp")).toHaveLength(2);
    expect(searchTasks("dark")).toHaveLength(1);
    expect(searchTasks("bugfix")).toHaveLength(1);
    expect(searchTasks("nonexistent")).toHaveLength(0);
  });

  // ── History ──────────────────────────────────────────────────────

  it("taskHistory returns full transition log", async () => {
    const { addTask, moveTask, taskHistory } = await import("@src/kanban.js");
    addTask("Track me", readyOpts("Track me"));
    moveTask(1, "in-progress");
    moveTask(1, "in-review");
    moveTask(1, "shipped");

    const history = taskHistory(1);
    expect(history).toHaveLength(3);
    expect(history[0]!.from).toBe("backlog");
    expect(history[0]!.to).toBe("in-progress");
    expect(history[2]!.from).toBe("in-review");
    expect(history[2]!.to).toBe("shipped");
  });

  // ── Slugify ──────────────────────────────────────────────────────

  it("slugify produces clean filenames", async () => {
    const { slugify } = await import("@src/kanban.js");
    expect(slugify("Fix Auth Bug")).toBe("fix-auth-bug");
    expect(slugify("Add dark mode!")).toBe("add-dark-mode");
    expect(slugify("  spaces  everywhere  ")).toBe("spaces-everywhere");
    expect(slugify("A".repeat(100))).toHaveLength(40);
  });

  // ── Board summary text for system prompt ─────────────────────────

  it("boardSummaryText returns formatted text", async () => {
    const { addTask, moveTask, boardSummaryText } = await import("@src/kanban.js");
    addTask("Active task", readyOpts("Active task"));
    moveTask(1, "in-progress");

    const text = boardSummaryText();
    expect(text).toContain("## Current Tasks");
    expect(text).toContain("In Progress: 1");
    expect(text).toContain("#1 Active task");
  });

  it("boardSummaryText returns empty for empty board", async () => {
    const { boardSummaryText } = await import("@src/kanban.js");
    const text = boardSummaryText();
    expect(text).toBe("");
  });

  // ── Archive ──────────────────────────────────────────────────────

  it("archiveShipped moves old shipped tasks to archive/", async () => {
    const { addTask, moveTask, archiveShipped, getTask } = await import("@src/kanban.js");
    const { getActivePersonaHome } = await import("@src/config.js");

    addTask("Old shipped", readyOpts("Old shipped"));
    moveTask(1, "in-progress");
    moveTask(1, "in-review");
    moveTask(1, "shipped");

    // Patch the task's updated time to 10 days ago
    const kanbanDir = path.join(getActivePersonaHome(), "kanban");
    const shippedFiles = fs.readdirSync(path.join(kanbanDir, "shipped"));
    expect(shippedFiles).toHaveLength(1);
    const taskFile = path.join(kanbanDir, "shipped", shippedFiles[0]!);
    let content = fs.readFileSync(taskFile, "utf8");
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    content = content.replace(/^updated: .+$/m, `updated: ${oldDate}`);
    fs.writeFileSync(taskFile, content, "utf8");

    const archived = archiveShipped(7);
    expect(archived).toHaveLength(1);
    expect(archived[0]!.id).toBe(1);

    expect(getTask(1)).toBeNull();

    const archiveFiles = fs.readdirSync(path.join(kanbanDir, "archive"));
    expect(archiveFiles).toHaveLength(1);
  });

  it("archiveShipped skips recently shipped tasks", async () => {
    const { addTask, moveTask, archiveShipped } = await import("@src/kanban.js");
    addTask("Recent ship", readyOpts("Recent ship"));
    moveTask(1, "in-progress");
    moveTask(1, "in-review");
    moveTask(1, "shipped");

    const archived = archiveShipped(7);
    expect(archived).toHaveLength(0);
  });

  // ── Transition gates ────────────────────────────────────────────

  it("isForwardTransition distinguishes forward from backward moves", async () => {
    const { isForwardTransition } = await import("@src/kanban.js");
    expect(isForwardTransition("backlog", "in-progress")).toBe(true);
    expect(isForwardTransition("in-progress", "in-review")).toBe(true);
    expect(isForwardTransition("in-review", "shipped")).toBe(true);
    expect(isForwardTransition("in-progress", "backlog")).toBe(false);
    expect(isForwardTransition("in-review", "in-progress")).toBe(false);
  });

  it("blocked task cannot advance: backlog → in-progress", async () => {
    const { addTask, moveTask } = await import("@src/kanban.js");
    addTask("Blocker", readyOpts("Blocker"));
    addTask("Blocked", readyOpts("Blocked", { blocked_by: [1] }));
    expect(() => moveTask(2, "in-progress")).toThrow("blocked by #1");
  });

  it("blocked task cannot advance: in-progress → in-review", async () => {
    const { addTask, moveTask, editTask } = await import("@src/kanban.js");
    addTask("Blocker", readyOpts("Blocker"));
    addTask("Task", readyOpts("Task"));
    moveTask(2, "in-progress");
    editTask(2, { blocked_by: [1] });
    expect(() => moveTask(2, "in-review")).toThrow("blocked by #1");
  });

  it("blocked task cannot advance: in-review → shipped", async () => {
    const { addTask, moveTask, editTask } = await import("@src/kanban.js");
    addTask("Blocker", readyOpts("Blocker"));
    addTask("Task", readyOpts("Task"));
    moveTask(2, "in-progress");
    moveTask(2, "in-review");
    editTask(2, { blocked_by: [1] });
    expect(() => moveTask(2, "shipped")).toThrow("blocked by #1");
  });

  it("empty body sections block backlog → in-progress", async () => {
    const { addTask, moveTask } = await import("@src/kanban.js");
    // Default body has empty sections (only HTML comment guides)
    addTask("Empty sections", { project: "testproject" });
    expect(() => moveTask(1, "in-progress")).toThrow('"Problem / Work Summary" is empty');
  });

  it("partially filled sections block backlog → in-progress", async () => {
    const { addTask, moveTask } = await import("@src/kanban.js");
    const body = [
      "# Partial",
      "",
      "## Problem / Work Summary",
      "",
      "Has content here.",
      "",
      "## Research Planning",
      "",
      "## Implementation Plan",
      "",
      "Has content here too.",
      "",
      "## Acceptance Criteria",
      "",
    ].join("\n");
    addTask("Partial", { project: "testproject", body });
    try {
      moveTask(1, "in-progress");
      expect.fail("Should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('"Research Planning" is empty');
      expect(msg).toContain('"Acceptance Criteria" is empty');
      expect(msg).not.toContain('"Problem / Work Summary"');
      expect(msg).not.toContain('"Implementation Plan"');
    }
  });

  it("fully filled sections allow backlog → in-progress", async () => {
    const { addTask, moveTask } = await import("@src/kanban.js");
    addTask("Ready task", readyOpts("Ready task"));
    const moved = moveTask(1, "in-progress");
    expect(moved.state).toBe("in-progress");
  });

  it("default project blocks backlog → in-progress", async () => {
    const { addTask, moveTask } = await import("@src/kanban.js");
    // project defaults to "default", body is filled
    addTask("Default project", { body: readyBody("Default project") });
    expect(() => moveTask(1, "in-progress")).toThrow('Project is "default"');
  });

  it("sendbacks always allowed regardless of gates", async () => {
    const { addTask, moveTask, editTask } = await import("@src/kanban.js");
    addTask("Blocker", readyOpts("Blocker"));
    addTask("Task", readyOpts("Task"));
    moveTask(2, "in-progress");
    moveTask(2, "in-review");
    // Add blocker — sendback should still work
    editTask(2, { blocked_by: [1] });
    const sent = moveTask(2, "in-progress");
    expect(sent.state).toBe("in-progress");
    // Also test in-progress → backlog sendback
    const sentBack = moveTask(2, "backlog");
    expect(sentBack.state).toBe("backlog");
  });

  it("epic with no children cannot ship", async () => {
    const { addTask, moveTask } = await import("@src/kanban.js");
    addTask("Epic", readyOpts("Epic", { type: "epic" }));
    moveTask(1, "in-progress");
    moveTask(1, "in-review");
    expect(() => moveTask(1, "shipped")).toThrow("Epic has no child tasks");
  });

  it("epic with unshipped children cannot ship", async () => {
    const { addTask, moveTask } = await import("@src/kanban.js");
    addTask("Epic", readyOpts("Epic", { type: "epic" }));
    addTask("Child 1", readyOpts("Child 1", { parent: 1 }));
    addTask("Child 2", readyOpts("Child 2", { parent: 1 }));
    moveTask(1, "in-progress");
    moveTask(1, "in-review");
    // Only ship child 1
    moveTask(2, "in-progress");
    moveTask(2, "in-review");
    moveTask(2, "shipped");
    expect(() => moveTask(1, "shipped")).toThrow("unshipped child task(s)");
  });

  it("epic with all children shipped can ship", async () => {
    const { addTask, moveTask } = await import("@src/kanban.js");
    addTask("Epic", readyOpts("Epic", { type: "epic" }));
    addTask("Child 1", readyOpts("Child 1", { parent: 1 }));
    addTask("Child 2", readyOpts("Child 2", { parent: 1 }));
    moveTask(1, "in-progress");
    moveTask(1, "in-review");
    // Ship both children
    moveTask(2, "in-progress");
    moveTask(2, "in-review");
    moveTask(2, "shipped");
    moveTask(3, "in-progress");
    moveTask(3, "in-review");
    moveTask(3, "shipped");
    const shipped = moveTask(1, "shipped");
    expect(shipped.state).toBe("shipped");
  });

  it("checkTransitionGates returns all violations, not just first", async () => {
    const { addTask, checkTransitionGates } = await import("@src/kanban.js");
    addTask("Blocker");
    // default project, empty sections, blocked
    addTask("Multi-fail", { blocked_by: [1] });
    const result = checkTransitionGates(2, "in-progress");
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
    const codes = result.violations.map((v) => v.code);
    expect(codes).toContain("blocked");
    expect(codes).toContain("default_project");
    expect(codes).toContain("empty_section");
  });

  it("checkTransitionGates returns ok for valid moves", async () => {
    const { addTask, checkTransitionGates } = await import("@src/kanban.js");
    addTask("Ready", readyOpts("Ready"));
    const result = checkTransitionGates(1, "in-progress");
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  // ── Section detection ───────────────────────────────────────────

  it("extractSection returns null for missing heading", async () => {
    const { extractSection } = await import("@src/kanban.js");
    expect(extractSection("## Other\n\nContent.", "Missing Section")).toBeNull();
  });

  it("extractSection returns empty string for heading with no content", async () => {
    const { extractSection } = await import("@src/kanban.js");
    const body = "## Empty Section\n\n## Next Section\n\nContent.";
    expect(extractSection(body, "Empty Section")).toBe("");
  });

  it("extractSection returns content for filled section", async () => {
    const { extractSection } = await import("@src/kanban.js");
    const body = "## My Section\n\nHello world.\n\n## Next\n\nOther.";
    expect(extractSection(body, "My Section")).toBe("Hello world.");
  });

  it("extractSection handles last section (no next heading)", async () => {
    const { extractSection } = await import("@src/kanban.js");
    const body = "## Last Section\n\nFinal content.";
    expect(extractSection(body, "Last Section")).toBe("Final content.");
  });

  it("extractSection strips HTML comments from content", async () => {
    const { extractSection } = await import("@src/kanban.js");
    const body = "## Guided Section\n<!--\nThis is a template guide.\n-->\n\n## Next\n\nOther.";
    expect(extractSection(body, "Guided Section")).toBe("");
  });

  it("extractSection returns real content alongside HTML comments", async () => {
    const { extractSection } = await import("@src/kanban.js");
    const body = "## Guided Section\n<!--\nTemplate guide.\n-->\n\nActual content here.\n\n## Next\n\nOther.";
    expect(extractSection(body, "Guided Section")).toBe("Actual content here.");
  });

  it("isSectionFilled returns false for whitespace-only content", async () => {
    const { isSectionFilled } = await import("@src/kanban.js");
    const body = "## My Section\n\n   \n  \n\n## Next\n\nContent.";
    expect(isSectionFilled(body, "My Section")).toBe(false);
  });

  it("isSectionFilled returns true for non-whitespace content", async () => {
    const { isSectionFilled } = await import("@src/kanban.js");
    const body = "## My Section\n\nReal content.\n\n## Next\n\nOther.";
    expect(isSectionFilled(body, "My Section")).toBe(true);
  });

  it("isSectionFilled returns false for section with only HTML comment", async () => {
    const { isSectionFilled } = await import("@src/kanban.js");
    const body = "## My Section\n<!-- guide text -->\n\n## Next\n\nOther.";
    expect(isSectionFilled(body, "My Section")).toBe(false);
  });
});
