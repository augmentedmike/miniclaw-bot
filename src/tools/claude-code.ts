import { z } from "zod";
import { tool } from "ai";
import { runProcess } from "./run-process.js";

/**
 * Claude Code tool — delegates complex tasks to Claude Code CLI.
 * Runs `claude` in non-interactive print mode with full permissions.
 */
export const claudeCodeTool = tool({
  description:
    "Delegate a complex task to Claude Code (an AI coding agent with full filesystem, " +
    "shell, web search, and code editing capabilities). Use this for multi-step coding tasks, " +
    "refactoring, debugging, writing tests, or any task that benefits from an autonomous " +
    "coding agent. Claude Code has its own tool loop and will use Read, Write, Edit, Bash, " +
    "Glob, Grep, WebSearch, and WebFetch as needed. Returns the final result.",
  parameters: z.object({
    task: z.string().describe("Detailed description of the task to delegate"),
    workdir: z.string().optional().describe("Working directory for Claude Code (defaults to cwd)"),
    model: z.string().optional().describe("Model to use (e.g. 'sonnet', 'opus', 'haiku'). Defaults to sonnet."),
    maxBudget: z.number().optional().describe("Max USD to spend on this task (default: no limit)"),
  }),
  execute: async ({ task, workdir, model, maxBudget }) => {
    const args = [
      "--print",
      "--dangerously-skip-permissions",
      "--output-format", "text",
    ];

    if (model) {
      args.push("--model", model);
    }

    if (maxBudget) {
      args.push("--max-budget-usd", String(maxBudget));
    }

    args.push(task);

    return runProcess({
      command: "claude",
      args,
      spawnOpts: {
        cwd: workdir ?? process.cwd(),
        env: process.env,
        // No timeout — Claude Code tasks can be long-running
      },
      formatResult: (stdout, stderr, exitCode) => {
        if (exitCode === 0 && stdout.trim()) {
          return stdout.trim();
        }
        const parts: string[] = [];
        if (stdout.trim()) parts.push(stdout.trim());
        if (stderr.trim()) parts.push(`[stderr] ${stderr.trim()}`);
        if (exitCode !== 0 && exitCode !== null) {
          parts.push(`[exit code: ${exitCode}]`);
        }
        return parts.join("\n\n") || "[no output]";
      },
      formatError: (err) => `[error] Failed to run claude: ${err.message}`,
    });
  },
});
