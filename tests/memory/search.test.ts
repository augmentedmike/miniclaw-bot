import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// We need to mock getMinicawHome before importing search
let tmpDir: string;

vi.mock("@src/config.js", () => ({
  getMinicawHome: () => tmpDir,
}));

// Import after mock
const { searchMemory } = await import("@memory/search.js");

describe("searchMemory", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-test-"));
    fs.mkdirSync(path.join(tmpDir, "memory"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds matching lines across files", () => {
    fs.writeFileSync(
      path.join(tmpDir, "memory", "prefs.md"),
      "# Preferences\n\nI prefer TypeScript over JavaScript\nI like dark mode\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, "memory", "notes.md"),
      "# Notes\n\nRemember to buy milk\n",
    );

    const results = searchMemory("TypeScript");
    expect(results.length).toBe(1);
    expect(results[0]!.file).toBe("prefs");
    expect(results[0]!.snippet).toContain("TypeScript");
  });

  it("returns empty for no matches", () => {
    fs.writeFileSync(path.join(tmpDir, "memory", "test.md"), "nothing relevant\n");
    expect(searchMemory("xyznonexistent")).toEqual([]);
  });

  it("is case insensitive", () => {
    fs.writeFileSync(path.join(tmpDir, "memory", "test.md"), "Hello World\n");
    expect(searchMemory("hello")).toHaveLength(1);
  });

  it("handles empty memory directory", () => {
    expect(searchMemory("anything")).toEqual([]);
  });

  it("returns empty when memory directory does not exist", () => {
    // Remove memory directory to trigger catch path on readdirSync
    fs.rmSync(path.join(tmpDir, "memory"), { recursive: true, force: true });
    expect(searchMemory("anything")).toEqual([]);
  });

  it("skips unreadable files gracefully", () => {
    // Create a valid file and a symlink to a nonexistent file
    fs.writeFileSync(
      path.join(tmpDir, "memory", "good.md"),
      "Hello World\n",
    );
    // Create an unreadable .md file by making a symlink to nonexistent target
    fs.symlinkSync(
      "/nonexistent/broken-target.md",
      path.join(tmpDir, "memory", "broken.md"),
    );

    // Should still return results from the good file without crashing
    const results = searchMemory("Hello");
    expect(results.length).toBe(1);
    expect(results[0]!.file).toBe("good");
  });
});
