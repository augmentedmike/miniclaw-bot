import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";

export type RunProcessOptions = {
  command: string;
  args: string[];
  spawnOpts: SpawnOptionsWithoutStdio;
  /** Format the collected stdout/stderr/exitCode into the final string */
  formatResult: (stdout: string, stderr: string, exitCode: number | null) => string;
  /** Format a spawn error into the final string */
  formatError: (err: Error) => string;
};

/**
 * Spawn a process, buffer stdout/stderr, and resolve with a formatted string.
 * Shared between shell and claude-code tools to avoid duplicating the
 * stdout/stderr collect-and-format pattern.
 */
export function runProcess(opts: RunProcessOptions): Promise<string> {
  return new Promise<string>((resolve) => {
    const proc = spawn(opts.command, opts.args, {
      ...opts.spawnOpts,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (exitCode) => {
      resolve(opts.formatResult(stdout, stderr, exitCode));
    });

    proc.on("error", (err) => {
      resolve(opts.formatError(err));
    });
  });
}
