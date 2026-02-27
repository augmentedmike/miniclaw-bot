import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

vi.mock("@src/config.js", () => ({
  getMinicawHome: () => tmpDir,
}));

const { memorySaveTool, memorySearchTool } = await import("@tools/memory.js");

const ctx = { toolCallId: "test", messages: [] as never[], abortSignal: new AbortController().signal };

describe("memory tools", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-mem-"));
    fs.mkdirSync(path.join(tmpDir, "memory"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("memory_save", () => {
    it("saves content to a markdown file", async () => {
      const result = await memorySaveTool.execute(
        { topic: "user-preferences", content: "Prefers TypeScript over JavaScript" },
        ctx,
      );
      expect(result).toContain("Saved to memory");
      const file = path.join(tmpDir, "memory", "user-preferences.md");
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, "utf8");
      expect(content).toContain("user-preferences");
      expect(content).toContain("Prefers TypeScript");
    });

    it("sanitizes topic names", async () => {
      await memorySaveTool.execute(
        { topic: "My Weird Topic!@#$", content: "test" },
        ctx,
      );
      const file = path.join(tmpDir, "memory", "my-weird-topic.md");
      expect(fs.existsSync(file)).toBe(true);
    });
  });

  describe("memory_search", () => {
    it("finds saved memories", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "memory", "prefs.md"),
        "# Preferences\n\nUser prefers dark mode\n",
      );
      const result = await memorySearchTool.execute({ query: "dark mode" }, ctx);
      expect(result).toContain("dark mode");
      expect(result).toContain("prefs");
    });

    it("returns available topics when no match", async () => {
      fs.writeFileSync(path.join(tmpDir, "memory", "notes.md"), "some notes\n");
      const result = await memorySearchTool.execute({ query: "nonexistent" }, ctx);
      expect(result).toContain("No matches");
      expect(result).toContain("notes");
    });

    it("reports empty memory", async () => {
      const result = await memorySearchTool.execute({ query: "anything" }, ctx);
      expect(result).toContain("Memory is empty");
    });
  });
});
