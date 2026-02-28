import fs from "node:fs";
import { z } from "zod";
import { tool } from "ai";
import { formatToolError, resolveJailed } from "./util.js";

export function createEditFileTool(jailDir?: string) {
  return tool({
    description:
      "Make a precise edit to a file by replacing an exact string match. " +
      "Provide the old text (must match exactly, including whitespace/indentation) " +
      "and the new text to replace it with. Use replace_all to change every occurrence.",
    parameters: z.object({
      path: z.string().describe("Absolute or relative path to the file"),
      old_string: z.string().describe("The exact text to find and replace"),
      new_string: z.string().describe("The replacement text"),
      replace_all: z.boolean().optional().describe("Replace all occurrences (default: false, replaces first only)"),
    }),
    execute: async ({ path: filePath, old_string, new_string, replace_all }) => {
      try {
        const resolved = resolveJailed(filePath, jailDir);
        const content = fs.readFileSync(resolved, "utf8");

        if (!content.includes(old_string)) {
          return `[error] old_string not found in ${resolved}. Make sure whitespace and indentation match exactly.`;
        }

        const occurrences = content.split(old_string).length - 1;

        let updated: string;
        if (replace_all) {
          updated = content.replaceAll(old_string, new_string);
        } else {
          if (occurrences > 1) {
            return `[error] old_string has ${occurrences} matches in ${resolved}. Provide more context to make it unique, or set replace_all: true.`;
          }
          updated = content.replace(old_string, new_string);
        }

        fs.writeFileSync(resolved, updated);
        const count = replace_all ? occurrences : 1;
        return `Replaced ${count} occurrence${count > 1 ? "s" : ""} in ${resolved}`;
      } catch (err) {
        return formatToolError(err);
      }
    },
  });
}

// Backward-compatible export
export const editFileTool = createEditFileTool();
