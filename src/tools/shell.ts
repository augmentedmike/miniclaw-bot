import { spawn } from "node:child_process";
import { z } from "zod";
import { tool } from "ai";

export function createShellTool(timeoutMs: number = 30_000) {
  return tool({
    description:
      "Execute a shell command and return its output. " +
      "Use for running system commands, scripts, package managers, git, etc. " +
      "Commands run in the user's default shell with their full environment.",
    parameters: z.object({
      command: z.string().describe("The shell command to execute"),
      workdir: z.string().optional().describe("Working directory (defaults to cwd)"),
      timeout: z.number().optional().describe("Timeout in milliseconds (default 30s)"),
    }),
    execute: async ({ command, workdir, timeout }) => {
      const effectiveTimeout = timeout ?? timeoutMs;
      return new Promise<string>((resolve) => {
        const shell = process.env.SHELL ?? "/bin/sh";
        const proc = spawn(shell, ["-c", command], {
          cwd: workdir ?? process.cwd(),
          timeout: effectiveTimeout,
          stdio: ["pipe", "pipe", "pipe"],
          env: process.env,
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
          const parts: string[] = [];
          if (stdout.trim()) parts.push(stdout.trim());
          if (stderr.trim()) parts.push(`[stderr]\n${stderr.trim()}`);
          if (exitCode !== 0 && exitCode !== null) {
            parts.push(`[exit code: ${exitCode}]`);
          }
          resolve(parts.join("\n\n") || "(no output)");
        });

        proc.on("error", (err) => {
          resolve(`[error] ${err.message}`);
        });
      });
    },
  });
}
