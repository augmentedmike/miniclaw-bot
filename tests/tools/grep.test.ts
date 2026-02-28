import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ctx = { toolCallId: "test", messages: [] as never[], abortSignal: new AbortController().signal };

// Store real references
let _realExecSync: typeof import("node:child_process").execSync;
let _realExecFileSync: typeof import("node:child_process").execFileSync;

// We need vi.mock to override ESM exports. Default behavior passes through to real implementation.
const mockExecSync = vi.fn((...args: unknown[]) => _realExecSync(...args as Parameters<typeof _realExecSync>));
const mockExecFileSync = vi.fn((...args: unknown[]) => _realExecFileSync(...args as Parameters<typeof _realExecFileSync>));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  _realExecSync = actual.execSync;
  _realExecFileSync = actual.execFileSync;
  return {
    ...actual,
    execSync: (...args: unknown[]) => mockExecSync(...args),
    execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
  };
});

describe("grep tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-grep-"));
    fs.writeFileSync(path.join(tmpDir, "hello.ts"), 'const greeting = "hello world";\nconsole.log(greeting);\n');
    fs.writeFileSync(path.join(tmpDir, "foo.ts"), "function foo() { return 42; }\n");
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(path.join(tmpDir, "sub", "bar.ts"), 'const hello = "bar";\n');
    // Reset to pass-through behavior
    mockExecSync.mockImplementation((...args: unknown[]) => _realExecSync(...args as Parameters<typeof _realExecSync>));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds matching lines", async () => {
    const { grepTool } = await import("@tools/grep.js");
    const result = await grepTool.execute(
      { pattern: "hello", path: tmpDir, glob: undefined, case_insensitive: undefined, files_only: undefined, max_results: undefined },
      ctx,
    );
    expect(result).toContain("hello");
    expect(result).toContain("hello.ts");
  });

  it("supports case insensitive search", async () => {
    const { grepTool } = await import("@tools/grep.js");
    const result = await grepTool.execute(
      { pattern: "HELLO", path: tmpDir, glob: undefined, case_insensitive: true, files_only: undefined, max_results: undefined },
      ctx,
    );
    expect(result).toContain("hello");
  });

  it("supports files_only mode", async () => {
    const { grepTool } = await import("@tools/grep.js");
    const result = await grepTool.execute(
      { pattern: "hello", path: tmpDir, glob: undefined, case_insensitive: undefined, files_only: true, max_results: undefined },
      ctx,
    );
    expect(result).toContain("hello.ts");
    // Should not contain the actual matching line content in files-only mode
    expect(result).not.toContain("greeting");
  });

  it("returns message for no matches", async () => {
    const { grepTool } = await import("@tools/grep.js");
    const result = await grepTool.execute(
      { pattern: "zzzznonexistent", path: tmpDir, glob: undefined, case_insensitive: undefined, files_only: undefined, max_results: undefined },
      ctx,
    );
    expect(result).toContain("No matches");
  });

  it("searches recursively into subdirectories", async () => {
    const { grepTool } = await import("@tools/grep.js");
    const result = await grepTool.execute(
      { pattern: "hello", path: tmpDir, glob: undefined, case_insensitive: undefined, files_only: true, max_results: undefined },
      ctx,
    );
    expect(result).toContain("bar.ts");
  });

  it("falls back to grep when rg is not available", async () => {
    // "which rg" fails
    mockExecSync.mockImplementationOnce(() => { throw new Error("rg not found"); });
    // execFileSync runs real grep fallback
    mockExecFileSync.mockImplementationOnce((...args: unknown[]) =>
      _realExecFileSync(...args as Parameters<typeof _realExecFileSync>));

    const { grepTool } = await import("@tools/grep.js");
    const result = await grepTool.execute(
      { pattern: "hello", path: tmpDir, glob: undefined, case_insensitive: undefined, files_only: undefined, max_results: undefined },
      ctx,
    );
    expect(result).toContain("hello");
  });

  it("falls back to grep with glob filter and case insensitive", async () => {
    // "which rg" fails
    mockExecSync.mockImplementationOnce(() => { throw new Error("rg not found"); });
    // execFileSync runs real grep fallback
    mockExecFileSync.mockImplementationOnce((...args: unknown[]) =>
      _realExecFileSync(...args as Parameters<typeof _realExecFileSync>));

    const { grepTool } = await import("@tools/grep.js");
    const result = await grepTool.execute(
      { pattern: "hello", path: tmpDir, glob: "*.ts", case_insensitive: true, files_only: true, max_results: undefined },
      ctx,
    );
    expect(result).toContain("hello.ts");
  });

  it("returns error message for non-status-1 grep errors", async () => {
    // "which rg" passes
    mockExecSync.mockReturnValueOnce(Buffer.from("/usr/bin/rg\n"));
    // execFileSync for rg fails with exit code 2
    mockExecFileSync.mockImplementationOnce(() => {
      const err = new Error("rg syntax error") as Error & { status: number };
      err.status = 2;
      throw err;
    });

    const { grepTool } = await import("@tools/grep.js");
    const result = await grepTool.execute(
      { pattern: "[invalid", path: tmpDir, glob: undefined, case_insensitive: undefined, files_only: undefined, max_results: undefined },
      ctx,
    );
    expect(result).toContain("[error]");
  });

  it("returns no matches message for status 1 exit code", async () => {
    // which rg succeeds
    mockExecSync.mockReturnValueOnce(Buffer.from("/usr/bin/rg\n"));
    // execFileSync for rg throws status 1 (no matches)
    mockExecFileSync.mockImplementationOnce(() => {
      const err = new Error("") as Error & { status: number };
      err.status = 1;
      throw err;
    });

    const { grepTool } = await import("@tools/grep.js");
    const result = await grepTool.execute(
      { pattern: "nonexistent", path: tmpDir, glob: undefined, case_insensitive: undefined, files_only: undefined, max_results: undefined },
      ctx,
    );
    expect(result).toContain("No matches");
  });
});
