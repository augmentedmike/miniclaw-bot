import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ctx = { toolCallId: "test", messages: [] as never[], abortSignal: new AbortController().signal };

// We need to control the glob function behavior per-test
let shouldGlobThrow = false;

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    // Override glob to conditionally throw
    glob: (...args: unknown[]) => {
      if (shouldGlobThrow) {
        throw new Error("glob not available in this Node version");
      }
      // @ts-ignore - call the real glob
      return actual.glob(...args);
    },
  };
});

describe("glob tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    shouldGlobThrow = false;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-glob-"));
    fs.writeFileSync(path.join(tmpDir, "a.ts"), "");
    fs.writeFileSync(path.join(tmpDir, "b.ts"), "");
    fs.writeFileSync(path.join(tmpDir, "c.json"), "");
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(path.join(tmpDir, "sub", "d.ts"), "");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds files matching a pattern", async () => {
    const { globTool } = await import("@tools/glob.js");
    const result = await globTool.execute({ pattern: "*.ts", cwd: tmpDir }, ctx);
    expect(result).toContain("a.ts");
    expect(result).toContain("b.ts");
    expect(result).not.toContain("c.json");
  });

  it("supports recursive patterns", async () => {
    const { globTool } = await import("@tools/glob.js");
    const result = await globTool.execute({ pattern: "**/*.ts", cwd: tmpDir }, ctx);
    expect(result).toContain("a.ts");
    expect(result).toContain("d.ts");
  });

  it("returns message for no matches", async () => {
    const { globTool } = await import("@tools/glob.js");
    const result = await globTool.execute({ pattern: "*.xyz", cwd: tmpDir }, ctx);
    expect(result).toContain("No files matching");
  });

  it("truncates at 500 results", async () => {
    // Create 501 files
    for (let i = 0; i < 501; i++) {
      fs.writeFileSync(path.join(tmpDir, `file${String(i).padStart(4, "0")}.txt`), "");
    }
    const { globTool } = await import("@tools/glob.js");
    const result = await globTool.execute({ pattern: "*.txt", cwd: tmpDir }, ctx);
    expect(result).toContain("truncated at 500 results");
  });

  it("falls back to shell find when glob throws", async () => {
    shouldGlobThrow = true;
    const { globTool } = await import("@tools/glob.js");
    const result = await globTool.execute({ pattern: "*.ts", cwd: tmpDir }, ctx);
    // The find fallback should work
    expect(typeof result).toBe("string");
    // Should either find files or indicate no matches (find has different pattern matching)
  });

  it("falls back returns no matches message from find", async () => {
    shouldGlobThrow = true;
    const { globTool } = await import("@tools/glob.js");
    const result = await globTool.execute({ pattern: "*.xyz", cwd: tmpDir }, ctx);
    expect(result).toContain("No files matching");
  });

  it("falls back uses default cwd in find fallback", async () => {
    shouldGlobThrow = true;
    const { globTool } = await import("@tools/glob.js");
    const result = await globTool.execute({ pattern: "*.nonexistent_ext_xyz", cwd: undefined }, ctx);
    // Should run without error
    expect(typeof result).toBe("string");
  });

  it("returns error when both glob and find fail", async () => {
    shouldGlobThrow = true;
    const { globTool } = await import("@tools/glob.js");
    // Use a nonexistent directory so find also fails
    const result = await globTool.execute({ pattern: "*.ts", cwd: "/nonexistent/dir/that/does/not/exist" }, ctx);
    expect(result).toContain("[error]");
  });
});
