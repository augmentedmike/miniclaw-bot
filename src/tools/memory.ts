import { z } from "zod";
import { tool } from "ai";
import { saveMemory, listMemories } from "../memory/store.js";
import { searchMemory } from "../memory/search.js";

export const memorySaveTool = tool({
  description:
    "Save a piece of information to long-term memory. Use this when the user asks you " +
    "to remember something, or when you learn an important fact about the user or their " +
    "preferences. Memories persist across conversations and restarts.",
  parameters: z.object({
    topic: z.string().describe("Short topic name (used as filename, e.g. 'user-preferences', 'project-notes')"),
    content: z.string().describe("The content to remember (markdown)"),
  }),
  execute: async ({ topic, content }) => {
    const filePath = saveMemory(topic, content);
    return `Saved to memory: ${filePath}`;
  },
});

export const memorySearchTool = tool({
  description:
    "Search long-term memory for relevant information. Use this proactively when " +
    "answering questions that might relate to previously saved knowledge, user preferences, " +
    "or past conversations.",
  parameters: z.object({
    query: z.string().describe("Search query (case-insensitive substring match across all memory files)"),
  }),
  execute: async ({ query }) => {
    const results = searchMemory(query);
    if (results.length === 0) {
      const topics = listMemories();
      if (topics.length === 0) {
        return "No memories found. Memory is empty.";
      }
      return `No matches for "${query}". Available memory topics: ${topics.join(", ")}`;
    }
    const formatted = results.slice(0, 10).map((r) =>
      `[${r.file}:${r.line}]\n${r.snippet}`,
    ).join("\n\n");
    return `Found ${results.length} matches:\n\n${formatted}`;
  },
});
