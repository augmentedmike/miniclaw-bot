import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ctx = { toolCallId: "test", messages: [] as never[], abortSignal: new AbortController().signal };

describe("kanban exclusion zone", () => {
  let tmpDir: string;
  let kanbanDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-exclusion-"));
    process.env.MINICLAW_HOME = tmpDir;

    // Create persona structure so getActivePersonaHome/getKanbanDir resolve
    kanbanDir = path.join(tmpDir, "user", "personas", "default", "kanban");
    fs.mkdirSync(path.join(kanbanDir, "backlog"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "user", "active-persona"), "default", "utf8");

    // Seed a task file for edit/read tests
    fs.writeFileSync(
      path.join(kanbanDir, "backlog", "001-test-task.md"),
      `---\nid: 1\ntitle: Test task\nproject: default\ntype: chore\npriority: medium\nstatus: active\nsize: medium\ndue: null\nparent: null\nblocked_by: []\ncreated: 2026-02-28T00:00:00Z\nupdated: 2026-02-28T00:00:00Z\nhistory: []\n---\n\n# Test task\n`,
      "utf8",
    );

    // Seed _meta.json
    fs.writeFileSync(
      path.join(kanbanDir, "_meta.json"),
      JSON.stringify({ nextId: 2, created: "2026-02-28T00:00:00Z" }),
      "utf8",
    );
  });

  afterEach(() => {
    delete process.env.MINICLAW_HOME;
    vi.resetModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── isProtectedPath unit tests ──────────────────────────────────

  describe("isProtectedPath", () => {
    it("detects kanban directory as protected", async () => {
      const { isProtectedPath } = await import("@tools/util.js");
      expect(isProtectedPath(kanbanDir)).toBe("kanban");
    });

    it("detects kanban subdirectory as protected", async () => {
      const { isProtectedPath } = await import("@tools/util.js");
      expect(isProtectedPath(path.join(kanbanDir, "backlog", "001-test.md"))).toBe("kanban");
    });

    it("detects _meta.json as protected", async () => {
      const { isProtectedPath } = await import("@tools/util.js");
      expect(isProtectedPath(path.join(kanbanDir, "_meta.json"))).toBe("kanban");
    });

    it("allows paths outside kanban dir", async () => {
      const { isProtectedPath } = await import("@tools/util.js");
      expect(isProtectedPath(path.join(tmpDir, "user", "personas", "default", "memory", "test.md"))).toBeNull();
    });

    it("allows completely unrelated paths", async () => {
      const { isProtectedPath } = await import("@tools/util.js");
      expect(isProtectedPath("/tmp/some-other-file.txt")).toBeNull();
    });
  });

  // ── write_file guardrail ────────────────────────────────────────

  describe("write_file blocks kanban writes", () => {
    it("blocks writing to kanban/backlog/", async () => {
      const { createWriteFileTool } = await import("@tools/files.js");
      const tool = createWriteFileTool();
      const result = await tool.execute({
        path: path.join(kanbanDir, "backlog", "evil.md"),
        content: "injected task",
      }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("protected kanban zone");
      expect(fs.existsSync(path.join(kanbanDir, "backlog", "evil.md"))).toBe(false);
    });

    it("blocks writing to kanban/_meta.json", async () => {
      const { createWriteFileTool } = await import("@tools/files.js");
      const tool = createWriteFileTool();
      const original = fs.readFileSync(path.join(kanbanDir, "_meta.json"), "utf8");
      const result = await tool.execute({
        path: path.join(kanbanDir, "_meta.json"),
        content: '{"nextId":999}',
      }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("protected kanban zone");
      // Verify file unchanged
      expect(fs.readFileSync(path.join(kanbanDir, "_meta.json"), "utf8")).toBe(original);
    });

    it("still allows writing outside kanban dir", async () => {
      const { createWriteFileTool } = await import("@tools/files.js");
      const tool = createWriteFileTool();
      const safePath = path.join(tmpDir, "user", "personas", "default", "notes.txt");
      const result = await tool.execute({
        path: safePath,
        content: "this is fine",
      }, ctx);
      expect(result).toContain("Wrote");
      expect(fs.readFileSync(safePath, "utf8")).toBe("this is fine");
    });
  });

  // ── edit_file guardrail ─────────────────────────────────────────

  describe("edit_file blocks kanban edits", () => {
    it("blocks editing kanban task files", async () => {
      const { createEditFileTool } = await import("@tools/edit.js");
      const tool = createEditFileTool();
      const taskPath = path.join(kanbanDir, "backlog", "001-test-task.md");
      const original = fs.readFileSync(taskPath, "utf8");

      const result = await tool.execute({
        path: taskPath,
        old_string: "priority: medium",
        new_string: "priority: critical",
        replace_all: undefined,
      }, ctx);

      expect(result).toContain("[error]");
      expect(result).toContain("protected kanban zone");
      // Verify file unchanged
      expect(fs.readFileSync(taskPath, "utf8")).toBe(original);
    });
  });

  // ── read_file is NOT blocked ────────────────────────────────────

  describe("read_file allows kanban reads", () => {
    it("reads kanban task files without error", async () => {
      const { createReadFileTool } = await import("@tools/files.js");
      const tool = createReadFileTool();
      const result = await tool.execute({
        path: path.join(kanbanDir, "backlog", "001-test-task.md"),
        maxLines: undefined,
      }, ctx);
      expect(result).toContain("Test task");
      expect(result).not.toContain("[error]");
    });
  });

  // ── shell_exec guardrail ────────────────────────────────────────

  describe("shell_exec blocks kanban path references", () => {
    it("blocks echo > kanban/...", async () => {
      const { createShellTool } = await import("@tools/shell.js");
      const jailDir = path.join(tmpDir, "user", "personas", "default");
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: `echo evil > ${path.join(kanbanDir, "backlog", "evil.md")}`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("protected kanban zone");
    });

    it("blocks rm kanban/...", async () => {
      const { createShellTool } = await import("@tools/shell.js");
      const jailDir = path.join(tmpDir, "user", "personas", "default");
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: `rm ${path.join(kanbanDir, "backlog", "001-test-task.md")}`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("protected kanban zone");
    });
  });

  // ── kanban tools still work ─────────────────────────────────────

  describe("kanban tools bypass the guardrail", () => {
    it("addTask works normally", async () => {
      const { addTask, getTask } = await import("@src/kanban.js");
      const task = addTask("Created via kanban tool");
      expect(task.id).toBe(2);
      expect(task.state).toBe("backlog");

      const retrieved = getTask(2);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.title).toBe("Created via kanban tool");
    });

    it("moveTask works normally", async () => {
      const { addTask, moveTask } = await import("@src/kanban.js");
      const body = "# Move me\n\n## Problem / Work Summary\n\nWork.\n\n## Research Planning\n\nResearch.\n\n## Implementation Plan\n\nPlan.\n\n## Acceptance Criteria\n\n- Done.\n";
      addTask("Move me", { project: "testproject", body });
      const moved = moveTask(2, "in-progress");
      expect(moved.state).toBe("in-progress");
    });
  });
});
