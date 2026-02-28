import { z } from "zod";
import { tool } from "ai";
import { saveMemory, listMemories } from "../memory/store.js";
import { searchMemory, vectorSearchMemory, deepSearchMemory } from "../memory/search.js";

export const memorySaveTool = tool({
  description:
    "Save a piece of information to long-term memory. Use this when the user asks you " +
    "to remember something, or when you learn an important fact about the user or their " +
    "preferences. Memories persist across conversations and restarts. " +
    "Automatically indexed for keyword and semantic search.",
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
    "Search long-term memory using keyword matching (BM25 ranked). " +
    "Use this for specific keyword lookups — when you know roughly what terms " +
    "to look for. Fast and precise.",
  parameters: z.object({
    query: z.string().describe("Search query (keywords to match)"),
    max_results: z.number().optional().describe("Max results to return (default: 10)"),
  }),
  execute: async ({ query, max_results }) => {
    const results = searchMemory(query, max_results ?? 10);
    return formatResults(query, results);
  },
});

export const memoryVectorSearchTool = tool({
  description:
    "Search long-term memory using semantic vector similarity. " +
    "Use this when you need conceptually related content that may not share " +
    "exact keywords — e.g. searching for 'authentication' should find notes " +
    "about 'login flow' or 'OAuth tokens'. Slower than keyword search but " +
    "finds meaning-based matches.",
  parameters: z.object({
    query: z.string().describe("Natural language query (meaning-based, not just keywords)"),
    max_results: z.number().optional().describe("Max results to return (default: 10)"),
  }),
  execute: async ({ query, max_results }) => {
    const results = vectorSearchMemory(query, max_results ?? 10);
    return formatResults(query, results);
  },
});

export const memoryDeepSearchTool = tool({
  description:
    "Deep search of long-term memory combining keywords, semantic vectors, " +
    "query expansion, and LLM re-ranking. Use this for important or complex " +
    "queries where you need the best possible results. Slowest but highest quality.",
  parameters: z.object({
    query: z.string().describe("Natural language query"),
    max_results: z.number().optional().describe("Max results to return (default: 10)"),
  }),
  execute: async ({ query, max_results }) => {
    const results = deepSearchMemory(query, max_results ?? 10);
    return formatResults(query, results);
  },
});

function formatResults(query: string, results: { file: string; line: number; snippet: string; score?: number }[]): string {
  if (results.length === 0) {
    const topics = listMemories();
    if (topics.length === 0) {
      return "No memories found. Memory is empty.";
    }
    return `No matches for "${query}". Available memory topics: ${topics.join(", ")}`;
  }
  const formatted = results.slice(0, 10).map((r) => {
    const scoreStr = r.score !== undefined ? ` (score: ${r.score.toFixed(2)})` : "";
    return `[${r.file}:${r.line}]${scoreStr}\n${r.snippet}`;
  }).join("\n\n");
  return `Found ${results.length} matches:\n\n${formatted}`;
}
