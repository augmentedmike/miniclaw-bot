import { z } from "zod";
import { tool } from "ai";
import { formatToolError, resolveJailed } from "./util.js";

export function createGlobTool(jailDir?: string) {
  return tool({
    description:
      "Find files matching a glob pattern. Supports ** for recursive matching, " +
      "* for single-level wildcards. Examples: '**/*.ts', 'src/**/*.test.ts', '*.json'.",
    parameters: z.object({
      pattern: z.string().describe("Glob pattern to match (e.g. '**/*.ts', 'src/**/*.json')"),
      cwd: z.string().optional().describe("Directory to search in (defaults to cwd)"),
    }),
    execute: async ({ pattern, cwd: searchDir }) => {
      let dir: string;
      try {
        dir = searchDir ? resolveJailed(searchDir, jailDir) : (jailDir ?? process.cwd());
      } catch (err) {
        return formatToolError(err);
      }

      try {
        const { glob } = await import("node:fs/promises");
        const matches: string[] = [];
        for await (const entry of glob(pattern, { cwd: dir })) {
          matches.push(entry);
          if (matches.length >= 500) break;
        }
        if (matches.length === 0) {
          return `No files matching "${pattern}" in ${dir}`;
        }
        const sorted = matches.sort();
        const result = sorted.join("\n");
        if (matches.length >= 500) {
          return `${result}\n\n[truncated at 500 results — narrow your pattern]`;
        }
        return result;
      } catch (err) {
        // Fallback: use shell find for older Node versions
        const { execSync } = await import("node:child_process");
        try {
          const result = execSync(
            `find . -path './${pattern}' -type f 2>/dev/null | head -500`,
            { cwd: dir, encoding: "utf8", timeout: 10_000 },
          );
          return result.trim() || `No files matching "${pattern}" in ${dir}`;
        } catch {
          const msg = err instanceof Error ? err.message : String(err);
          return `[error] ${msg}`;
        }
      }
    },
  });
}

// Backward-compatible export
export const globTool = createGlobTool();
