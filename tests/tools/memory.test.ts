import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

vi.mock("@src/config.js", () => ({
  getMinicawHome: () => tmpDir,
  getActivePersonaHome: () => tmpDir,
}));

// Mock child_process — qmd IS installed, simulate its behavior
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execSync: (cmd: string, ...args: unknown[]) => {
      if (typeof cmd === "string" && cmd.includes("which qmd")) {
        return "/usr/local/bin/qmd";
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd search")) {
        const memDir = path.join(tmpDir, "memory");
        const queryMatch = cmd.match(/qmd search '([^']+)'/);
        const query = queryMatch?.[1] ?? "";
        return simulateSearch(memDir, query);
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd collection")) {
        return "miniclaw-memory";
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd embed")) {
        return "";
      }
      // @ts-ignore
      return actual.execSync(cmd, ...args);
    },
  };
});

function simulateSearch(memDir: string, query: string): string {
  const results: { path: string; line: number; snippet: string; score: number }[] = [];
  const queryLower = query.toLowerCase();

  let files: string[];
  try {
    files = fs.readdirSync(memDir).filter((f) => f.endsWith(".md"));
  } catch {
    return JSON.stringify([]);
  }

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(memDir, file), "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.toLowerCase().includes(queryLower)) {
          results.push({
            path: file.replace(/\.md$/, ""),
            line: i + 1,
            snippet: lines[i]!,
            score: 1.0,
          });
        }
      }
    } catch {
      // skip
    }
  }

  return JSON.stringify(results);
}

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
      const result = await memorySearchTool.execute({ query: "dark mode", max_results: undefined }, ctx);
      expect(result).toContain("dark mode");
      expect(result).toContain("prefs");
    });

    it("returns available topics when no match", async () => {
      fs.writeFileSync(path.join(tmpDir, "memory", "notes.md"), "some notes\n");
      const result = await memorySearchTool.execute({ query: "nonexistent", max_results: undefined }, ctx);
      expect(result).toContain("No matches");
      expect(result).toContain("notes");
    });

    it("reports empty memory", async () => {
      const result = await memorySearchTool.execute({ query: "anything", max_results: undefined }, ctx);
      expect(result).toContain("No memories found");
    });
  });
});
