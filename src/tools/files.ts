import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { tool } from "ai";
import { formatToolError, resolveJailed } from "./util.js";

export function createReadFileTool(jailDir?: string) {
  return tool({
    description:
      "Read the contents of a file. Returns the file content as text. " +
      "Use absolute paths when possible.",
    parameters: z.object({
      path: z.string().describe("Absolute or relative path to the file"),
      maxLines: z.number().optional().describe("Max lines to read (default: all)"),
    }),
    execute: async ({ path: filePath, maxLines }) => {
      try {
        const resolved = resolveJailed(filePath, jailDir);
        const content = fs.readFileSync(resolved, "utf8");
        if (maxLines && maxLines > 0) {
          const lines = content.split("\n");
          const truncated = lines.slice(0, maxLines).join("\n");
          if (lines.length > maxLines) {
            return `${truncated}\n\n[... ${lines.length - maxLines} more lines]`;
          }
          return truncated;
        }
        return content || "(empty file)";
      } catch (err) {
        return formatToolError(err);
      }
    },
  });
}

export function createWriteFileTool(jailDir?: string) {
  return tool({
    description:
      "Write content to a file. Creates the file if it doesn't exist, " +
      "overwrites if it does. Creates parent directories as needed.",
    parameters: z.object({
      path: z.string().describe("Absolute or relative path to the file"),
      content: z.string().describe("The content to write"),
    }),
    execute: async ({ path: filePath, content }) => {
      try {
        const resolved = resolveJailed(filePath, jailDir);
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, content);
        return `Wrote ${content.length} bytes to ${resolved}`;
      } catch (err) {
        return formatToolError(err);
      }
    },
  });
}

export function createListDirectoryTool(jailDir?: string) {
  return tool({
    description:
      "List contents of a directory. Returns file/directory names with types and sizes.",
    parameters: z.object({
      path: z.string().describe("Absolute or relative path to the directory"),
      recursive: z.boolean().optional().describe("List recursively (default: false)"),
    }),
    execute: async ({ path: dirPath, recursive }) => {
      try {
        const resolved = resolveJailed(dirPath, jailDir);
        if (recursive) {
          const entries = listRecursive(resolved, "", 3);
          return entries.join("\n") || "(empty directory)";
        }
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const lines = entries.map((e) => {
          const type = e.isDirectory() ? "dir" : "file";
          if (e.isFile()) {
            try {
              const stat = fs.statSync(path.join(resolved, e.name));
              return `${type}  ${e.name}  (${formatSize(stat.size)})`;
            } catch {
              return `${type}  ${e.name}`;
            }
          }
          return `${type}  ${e.name}/`;
        });
        return lines.join("\n") || "(empty directory)";
      } catch (err) {
        return formatToolError(err);
      }
    },
  });
}

// Keep backward-compatible exports for existing callers (e.g. tests)
export const readFileTool = createReadFileTool();
export const writeFileTool = createWriteFileTool();
export const listDirectoryTool = createListDirectoryTool();

function listRecursive(base: string, prefix: string, maxDepth: number): string[] {
  if (maxDepth <= 0) return [`${prefix}...`];
  const entries = fs.readdirSync(path.join(base, prefix), { withFileTypes: true });
  const result: string[] = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      result.push(`dir   ${rel}/`);
      result.push(...listRecursive(base, rel, maxDepth - 1));
    } else {
      result.push(`file  ${rel}`);
    }
  }
  return result;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
