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

function readyOpts(title: string, extra?: Record<string, unknown>) {
  return { project: "testproject", body: readyBody(title), ...extra };
}

describe("dispatch", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-dispatch-"));
    process.env.MINICLAW_HOME = tmpDir;

    // Create persona structure
    fs.mkdirSync(path.join(tmpDir, "user", "personas", "default", "kanban"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "user", "active-persona"), "default", "utf8");
  });

  afterEach(() => {
    delete process.env.MINICLAW_HOME;
    vi.resetModules();
  });

  // ── Ticket selection ──────────────────────────────────────────────

  describe("selectNextTask", () => {
    it("picks highest-priority ready task", async () => {
      const { addTask, moveTask } = await import("@src/kanban.js");
      const { selectNextTask } = await import("@src/dispatch.js");

      addTask("Low pri", readyOpts("Low pri", { priority: "low" }));
      addTask("Critical pri", readyOpts("Critical pri", { priority: "critical" }));
      addTask("Medium pri", readyOpts("Medium pri", { priority: "medium" }));

      const task = selectNextTask();
      expect(task).not.toBeNull();
      expect(task!.title).toBe("Critical pri");
    });

    it("prefers in-progress over backlog (resume)", async () => {
      const { addTask, moveTask } = await import("@src/kanban.js");
      const { selectNextTask } = await import("@src/dispatch.js");

      addTask("Backlog critical", readyOpts("Backlog critical", { priority: "critical" }));
      const t2 = addTask("In progress low", readyOpts("In progress low", { priority: "low" }));
      moveTask(t2.id, "in-progress");

      const task = selectNextTask();
      expect(task).not.toBeNull();
      expect(task!.title).toBe("In progress low");
      expect(task!.state).toBe("in-progress");
    });

    it("skips locked tasks", async () => {
      const { addTask, moveTask } = await import("@src/kanban.js");
      const { selectNextTask, acquireLock } = await import("@src/dispatch.js");

      const t1 = addTask("Task A", readyOpts("Task A", { priority: "critical" }));
      moveTask(t1.id, "in-progress");
      const t2 = addTask("Task B", readyOpts("Task B", { priority: "low" }));
      moveTask(t2.id, "in-progress");

      acquireLock(t1.id);

      const task = selectNextTask();
      expect(task).not.toBeNull();
      expect(task!.id).toBe(t2.id);
    });

    it("skips on-hold tasks", async () => {
      const { addTask, moveTask, editTask } = await import("@src/kanban.js");
      const { selectNextTask } = await import("@src/dispatch.js");

      const t1 = addTask("On hold", readyOpts("On hold", { priority: "critical" }));
      moveTask(t1.id, "in-progress");
      editTask(t1.id, { status: "on-hold" });
      addTask("Available", readyOpts("Available", { priority: "low" }));

      const task = selectNextTask();
      expect(task).not.toBeNull();
      expect(task!.title).toBe("Available");
    });

    it("skips backlog tasks that fail gates", async () => {
      const { addTask } = await import("@src/kanban.js");
      const { selectNextTask } = await import("@src/dispatch.js");

      // Task without filled sections — will fail gates
      addTask("No sections", { priority: "critical" });
      // Task with filled sections and project
      addTask("Ready task", readyOpts("Ready task", { priority: "low" }));

      const task = selectNextTask();
      expect(task).not.toBeNull();
      expect(task!.title).toBe("Ready task");
    });

    it("returns null when board empty", async () => {
      const { selectNextTask } = await import("@src/dispatch.js");
      const task = selectNextTask();
      expect(task).toBeNull();
    });

    it("returns null when all tasks locked", async () => {
      const { addTask, moveTask } = await import("@src/kanban.js");
      const { selectNextTask, acquireLock } = await import("@src/dispatch.js");

      const t1 = addTask("Locked", readyOpts("Locked"));
      moveTask(t1.id, "in-progress");
      acquireLock(t1.id);

      const task = selectNextTask();
      expect(task).toBeNull();
    });

    it("sorts by due date when priority is equal", async () => {
      const { addTask } = await import("@src/kanban.js");
      const { selectNextTask } = await import("@src/dispatch.js");

      addTask("Later due", readyOpts("Later due", { priority: "high", due: "2099-12-31" }));
      addTask("Sooner due", readyOpts("Sooner due", { priority: "high", due: "2025-01-01" }));

      const task = selectNextTask();
      expect(task).not.toBeNull();
      expect(task!.title).toBe("Sooner due");
    });
  });

  // ── Concurrency ───────────────────────────────────────────────────

  describe("concurrency", () => {
    it("acquire/release lifecycle", async () => {
      const { acquireLock, releaseLock, countActiveLocks } = await import("@src/dispatch.js");

      expect(countActiveLocks()).toBe(0);
      acquireLock(1);
      expect(countActiveLocks()).toBe(1);
      releaseLock(1);
      expect(countActiveLocks()).toBe(0);
    });

    it("acquireLock throws on double lock", async () => {
      const { acquireLock } = await import("@src/dispatch.js");

      acquireLock(42);
      expect(() => acquireLock(42)).toThrow("already locked");
    });

    it("cleanStaleLocks removes dead PIDs", async () => {
      const { cleanStaleLocks, countActiveLocks } = await import("@src/dispatch.js");

      // Write a lock with a dead PID
      const lockDir = path.join(tmpDir, "dispatch", "locks");
      fs.mkdirSync(lockDir, { recursive: true });
      const info = { pid: 999999999, taskId: 99, startedAt: new Date().toISOString() };
      fs.writeFileSync(path.join(lockDir, "99.lock"), JSON.stringify(info), "utf8");

      expect(countActiveLocks()).toBe(1);
      const cleaned = cleanStaleLocks();
      expect(cleaned).toBe(1);
      expect(countActiveLocks()).toBe(0);
    });

    it("countActiveLocks is correct", async () => {
      const { acquireLock, countActiveLocks } = await import("@src/dispatch.js");

      acquireLock(1);
      acquireLock(2);
      acquireLock(3);
      expect(countActiveLocks()).toBe(3);
    });
  });

  // ── Audit ─────────────────────────────────────────────────────────

  describe("audit", () => {
    it("createAuditWriter appends JSONL lines", async () => {
      const { createAuditWriter, getAuditLogs } = await import("@src/dispatch.js");

      const writer = createAuditWriter(42);
      writer("info", "Started work");
      writer("warn", "Something odd");
      writer("error", "Failed hard");

      const logs = getAuditLogs(42);
      expect(logs).toHaveLength(1);

      const content = fs.readFileSync(logs[0], "utf8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(3);

      const first = JSON.parse(lines[0]);
      expect(first.level).toBe("info");
      expect(first.message).toBe("Started work");
      expect(first.at).toBeDefined();

      const last = JSON.parse(lines[2]);
      expect(last.level).toBe("error");
    });

    it("createAuditLogTool produces valid tool", async () => {
      const { createAuditLogTool } = await import("@src/tools/audit.js");

      const messages: { level: string; message: string }[] = [];
      const writer = (level: "info" | "warn" | "error", message: string) => {
        messages.push({ level, message });
      };

      const auditTool = createAuditLogTool(writer);
      expect(auditTool.description).toBeDefined();
      expect(auditTool.parameters).toBeDefined();

      const result = await auditTool.execute(
        { level: "info", message: "test entry" },
        { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
      );
      expect(result).toContain("Logged");
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toBe("test entry");
    });

    it("getAuditLogs returns empty for nonexistent task", async () => {
      const { getAuditLogs } = await import("@src/dispatch.js");
      expect(getAuditLogs(999)).toHaveLength(0);
    });

    it("getAuditLogs returns all logs when no taskId", async () => {
      const { createAuditWriter, getAuditLogs } = await import("@src/dispatch.js");

      createAuditWriter(1)("info", "task 1");
      createAuditWriter(2)("info", "task 2");

      const all = getAuditLogs();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── QMD (conditional) ────────────────────────────────────────────

  describe("qmd integration", () => {
    let qmdInstalled = false;

    beforeEach(() => {
      try {
        const { execSync } = require("node:child_process");
        execSync("which qmd", { stdio: "pipe" });
        qmdInstalled = true;
      } catch {
        qmdInstalled = false;
      }
    });

    it("ensureKanbanCollection registers collection (skip if qmd not installed)", { timeout: 15_000 }, async () => {
      if (!qmdInstalled) return;

      const { ensureKanbanCollection } = await import("@src/dispatch.js");
      // Should not throw
      ensureKanbanCollection();
    });

    it("searchRelatedTickets returns results (skip if qmd not installed)", { timeout: 30_000 }, async () => {
      if (!qmdInstalled) return;

      const { addTask } = await import("@src/kanban.js");
      const { ensureKanbanCollection, indexKanban, searchRelatedTickets } = await import("@src/dispatch.js");

      addTask("Test search task", readyOpts("Test search task"));
      ensureKanbanCollection();
      indexKanban();

      // Wait briefly for index
      await new Promise((r) => setTimeout(r, 1000));

      const results = searchRelatedTickets("test search");
      expect(Array.isArray(results)).toBe(true);
    });

    it("buildDispatchContext returns empty string when qmd disabled", async () => {
      const { buildDispatchContext } = await import("@src/dispatch.js");
      const { addTask } = await import("@src/kanban.js");

      const task = addTask("Test", readyOpts("Test"));
      const context = buildDispatchContext(task, false);
      expect(context).toBe("");
    });
  });

  // ── Dispatch cycle ────────────────────────────────────────────────

  describe("runDispatchCycle", () => {
    it("exits gracefully when at concurrency cap", async () => {
      const { acquireLock } = await import("@src/dispatch.js");
      const { addTask, moveTask } = await import("@src/kanban.js");

      const t = addTask("Locked", readyOpts("Locked"));
      moveTask(t.id, "in-progress");
      acquireLock(t.id);

      // With cap=1 and 1 active lock, should exit without error
      const { runDispatchCycle } = await import("@src/dispatch.js");
      await runDispatchCycle({
        model: "claude-sonnet-4-20250514",
        maxSteps: 1,
        shellTimeout: 5000,
        conversationLimit: 10,
        dispatchMaxConcurrent: 1,
        dispatchMaxSteps: 1,
      });
      // No error = success
    });

    it("exits gracefully when no tasks available", async () => {
      const { runDispatchCycle } = await import("@src/dispatch.js");
      await runDispatchCycle({
        model: "claude-sonnet-4-20250514",
        maxSteps: 1,
        shellTimeout: 5000,
        conversationLimit: 10,
        dispatchMaxConcurrent: 1,
        dispatchMaxSteps: 1,
      });
      // No error = success
    });
  });
});
