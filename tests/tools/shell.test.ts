import { describe, expect, it } from "vitest";
import { createShellTool } from "@tools/shell.js";

describe("shell_exec tool", () => {
  const shellTool = createShellTool(5000);

  it("executes a simple command", async () => {
    const result = await shellTool.execute(
      { command: "echo hello", workdir: undefined, timeout: undefined },
      { toolCallId: "test", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result).toContain("hello");
  });

  it("returns stderr", async () => {
    const result = await shellTool.execute(
      { command: "echo error >&2", workdir: undefined, timeout: undefined },
      { toolCallId: "test", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result).toContain("[stderr]");
    expect(result).toContain("error");
  });

  it("returns exit code for failed commands", async () => {
    const result = await shellTool.execute(
      { command: "exit 42", workdir: undefined, timeout: undefined },
      { toolCallId: "test", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result).toContain("[exit code: 42]");
  });

  it("respects working directory", async () => {
    const result = await shellTool.execute(
      { command: "pwd", workdir: "/tmp", timeout: undefined },
      { toolCallId: "test", messages: [], abortSignal: new AbortController().signal },
    );
    // macOS /tmp may resolve to /private/tmp
    expect(result).toMatch(/\/tmp/);
  });

  it("handles command not found", async () => {
    const result = await shellTool.execute(
      { command: "nonexistent_command_xyz_12345", workdir: undefined, timeout: undefined },
      { toolCallId: "test", messages: [], abortSignal: new AbortController().signal },
    );
    // Should contain an error (either from stderr or exit code)
    expect(result).toMatch(/not found|exit code|error/i);
  });
});
