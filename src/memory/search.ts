import fs from "node:fs";
import path from "node:path";
import { getMinicawHome } from "../config.js";

type SearchResult = {
  file: string;
  line: number;
  snippet: string;
};

/**
 * Search all memory files for a query string (case-insensitive substring match).
 * Returns matching lines with context.
 */
export function searchMemory(query: string): SearchResult[] {
  const dir = path.join(getMinicawHome(), "memory");
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();

  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.toLowerCase().includes(queryLower)) {
          // Include surrounding context (1 line before, 1 after)
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length - 1, i + 1);
          const snippet = lines.slice(start, end + 1).join("\n");
          results.push({
            file: file.replace(/\.md$/, ""),
            line: i + 1,
            snippet,
          });
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}
