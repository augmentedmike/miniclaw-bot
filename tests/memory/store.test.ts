import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

vi.mock("@src/config.js", () => ({
  getMinicawHome: () => tmpDir,
  getActivePersonaHome: () => tmpDir,
}));

// Mock child_process — qmd IS installed
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execSync: (cmd: string, ...args: unknown[]) => {
      if (typeof cmd === "string" && cmd.includes("which qmd")) {
        return "/usr/local/bin/qmd";
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd collection")) {
        return "miniclaw-memory";
      }
      // @ts-ignore
      return actual.execSync(cmd, ...args);
    },
    spawn: vi.fn(() => ({ unref: vi.fn() })),
  };
});

const { saveMemory, readMemory, listMemories } = await import("@memory/store.js");

describe("memory store", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-store-"));
    fs.mkdirSync(path.join(tmpDir, "memory"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("saveMemory", () => {
    it("creates a markdown file with topic header", () => {
      const filePath = saveMemory("test-topic", "some content");
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf8");
      expect(content).toBe("# test-topic\n\nsome content\n");
    });

    it("sanitizes topic to safe filename", () => {
      const filePath = saveMemory("My Topic With Spaces!", "content");
      expect(filePath).toContain("my-topic-with-spaces.md");
    });

    it("handles empty topic", () => {
      const filePath = saveMemory("", "content");
      expect(filePath).toContain("untitled.md");
    });

    it("overwrites existing file for same topic", () => {
      saveMemory("test", "first");
      saveMemory("test", "second");
      const content = readMemory("test");
      expect(content).toContain("second");
      expect(content).not.toContain("first");
    });
  });

  describe("readMemory", () => {
    it("reads an existing memory file", () => {
      saveMemory("notes", "my notes");
      const content = readMemory("notes");
      expect(content).toContain("my notes");
    });

    it("returns null for nonexistent topic", () => {
      expect(readMemory("nonexistent")).toBeNull();
    });
  });

  describe("listMemories", () => {
    it("lists all memory topics", () => {
      saveMemory("alpha", "a");
      saveMemory("beta", "b");
      const topics = listMemories();
      expect(topics).toContain("alpha");
      expect(topics).toContain("beta");
    });

    it("returns empty array when no memories", () => {
      expect(listMemories()).toEqual([]);
    });

    it("returns empty array when memory directory does not exist", () => {
      fs.rmSync(path.join(tmpDir, "memory"), { recursive: true, force: true });
      expect(listMemories()).toEqual([]);
    });
  });
});
