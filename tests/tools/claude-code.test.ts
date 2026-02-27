import { describe, expect, it, vi, beforeEach } from "vitest";

const ctx = { toolCallId: "test", messages: [] as never[], abortSignal: new AbortController().signal };

// Control mock behavior per test
let mockBehavior: "success" | "failure-with-stderr" | "failure-no-output" | "error-event" | "stderr-with-stdout" = "success";

// Mock child_process.spawn
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: vi.fn((cmd: string, args: string[], opts: unknown) => {
      const { EventEmitter } = require("node:events");
      const { Readable } = require("node:stream");

      const proc = new EventEmitter();
      proc.stdout = new Readable({ read() {} });
      proc.stderr = new Readable({ read() {} });
      proc.stdin = { write: vi.fn(), end: vi.fn() };

      setTimeout(() => {
        if (mockBehavior === "success") {
          proc.stdout.push("Task completed successfully");
          proc.stdout.push(null);
          proc.stderr.push(null);
          proc.emit("close", 0);
        } else if (mockBehavior === "failure-with-stderr") {
          proc.stdout.push(null);
          proc.stderr.push("Something went wrong");
          proc.stderr.push(null);
          proc.emit("close", 1);
        } else if (mockBehavior === "failure-no-output") {
          proc.stdout.push(null);
          proc.stderr.push(null);
          proc.emit("close", 0);
        } else if (mockBehavior === "error-event") {
          proc.emit("error", new Error("spawn ENOENT"));
        } else if (mockBehavior === "stderr-with-stdout") {
          proc.stdout.push("partial output");
          proc.stdout.push(null);
          proc.stderr.push("warning message");
          proc.stderr.push(null);
          proc.emit("close", 2);
        }
      }, 10);

      return proc;
    }),
  };
});

const { claudeCodeTool } = await import("@tools/claude-code.js");

describe("claude_code tool", () => {
  beforeEach(() => {
    mockBehavior = "success";
  });

  it("runs claude with correct flags", async () => {
    const result = await claudeCodeTool.execute(
      { task: "write a hello world", workdir: undefined, model: undefined, maxBudget: undefined },
      ctx,
    );
    expect(result).toContain("Task completed successfully");
  });

  it("passes model flag when specified", async () => {
    const { spawn } = await import("node:child_process");
    await claudeCodeTool.execute(
      { task: "test task", workdir: undefined, model: "opus", maxBudget: undefined },
      ctx,
    );
    expect(spawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--model", "opus"]),
      expect.any(Object),
    );
  });

  it("passes max-budget flag when specified", async () => {
    const { spawn } = await import("node:child_process");
    await claudeCodeTool.execute(
      { task: "test task", workdir: undefined, model: undefined, maxBudget: 5 },
      ctx,
    );
    expect(spawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--max-budget-usd", "5"]),
      expect.any(Object),
    );
  });

  it("returns stderr and exit code on failure", async () => {
    mockBehavior = "failure-with-stderr";
    const result = await claudeCodeTool.execute(
      { task: "failing task", workdir: undefined, model: undefined, maxBudget: undefined },
      ctx,
    );
    expect(result).toContain("[stderr] Something went wrong");
    expect(result).toContain("[exit code: 1]");
  });

  it("returns [no output] when no stdout or stderr", async () => {
    mockBehavior = "failure-no-output";
    const result = await claudeCodeTool.execute(
      { task: "silent fail", workdir: undefined, model: undefined, maxBudget: undefined },
      ctx,
    );
    expect(result).toContain("[no output]");
  });

  it("handles spawn error event", async () => {
    mockBehavior = "error-event";
    const result = await claudeCodeTool.execute(
      { task: "error task", workdir: undefined, model: undefined, maxBudget: undefined },
      ctx,
    );
    expect(result).toContain("[error] Failed to run claude: spawn ENOENT");
  });

  it("returns both stdout and stderr on non-zero exit", async () => {
    mockBehavior = "stderr-with-stdout";
    const result = await claudeCodeTool.execute(
      { task: "partial task", workdir: undefined, model: undefined, maxBudget: undefined },
      ctx,
    );
    expect(result).toContain("partial output");
    expect(result).toContain("[stderr] warning message");
    expect(result).toContain("[exit code: 2]");
  });
});
