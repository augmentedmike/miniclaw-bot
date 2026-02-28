import { execSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { tool } from "ai";
import { formatToolError, resolveJailed } from "./util.js";

export function createGrepTool(jailDir?: string) {
  return tool({
    description:
      "Search file contents for a regex pattern using ripgrep (rg). " +
      "Returns matching lines with file paths and line numbers. " +
      "Use the glob parameter to filter file types (e.g. '*.ts').",
    parameters: z.object({
      pattern: z.string().describe("Regex pattern to search for"),
      path: z.string().optional().describe("File or directory to search in (defaults to cwd)"),
      glob: z.string().optional().describe("Glob pattern to filter files (e.g. '*.ts', '*.{js,jsx}')"),
      case_insensitive: z.boolean().optional().describe("Case insensitive search (default: false)"),
      files_only: z.boolean().optional().describe("Only return file paths, not matching lines (default: false)"),
      max_results: z.number().optional().describe("Max results to return (default: 100)"),
    }),
    execute: async ({ pattern, path: searchPath, glob: globFilter, case_insensitive, files_only, max_results }) => {
      let dir: string;
      try {
        dir = searchPath ? resolveJailed(searchPath, jailDir) : (jailDir ?? process.cwd());
      } catch (err) {
        return formatToolError(err);
      }
      const limit = max_results ?? 100;

      // Try ripgrep first, fall back to grep
      const args: string[] = [];
      let cmd: string;

      try {
        // Check if rg is available
        execSync("which rg", { stdio: "pipe" });
        cmd = "rg";
        args.push("--no-heading", "--line-number");
        if (case_insensitive) args.push("-i");
        if (files_only) args.push("-l");
        if (globFilter) args.push("--glob", globFilter);
        args.push("--max-count", "10"); // per file
        args.push("--", pattern, dir);
      } catch {
        // Fall back to grep
        cmd = "grep";
        args.push("-rn");
        if (case_insensitive) args.push("-i");
        if (files_only) args.push("-l");
        if (globFilter) args.push("--include", globFilter);
        args.push("--", pattern, dir);
      }

      try {
        const fullCmd = `${cmd} ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")} 2>/dev/null | head -${limit}`;
        const result = execSync(fullCmd, {
          encoding: "utf8",
          timeout: 15_000,
          maxBuffer: 1024 * 1024,
          cwd: dir,
        });
        return result.trim() || `No matches for "${pattern}"`;
      } catch (err) {
        // grep/rg exit code 1 = no matches (not an error)
        if (err && typeof err === "object" && "status" in err && err.status === 1) {
          return `No matches for "${pattern}"`;
        }
        return formatToolError(err);
      }
    },
  });
}

// Backward-compatible export
export const grepTool = createGrepTool();
