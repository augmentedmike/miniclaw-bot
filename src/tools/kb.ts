/**
 * Knowledge Base tools for the agent.
 *
 * Provides structured, semantically searchable persistent storage.
 * Uses local SQLite + vector embeddings for hybrid search.
 */

import { z } from "zod";
import { tool } from "ai";
import { getKB } from "../kb/index.js";
import type { KBCategory } from "../kb/types.js";

const CATEGORIES = ["personality", "fact", "procedure", "general"] as const;

export const kbAddTool = tool({
  description:
    "Add an entry to the knowledge base. Use this to store personality traits, " +
    "learned facts about the user, operating procedures, or other persistent knowledge. " +
    "Entries are embedded for semantic search on insert.",
  parameters: z.object({
    category: z.enum(CATEGORIES).describe("Category: personality, fact, procedure, or general"),
    content: z.string().describe("The content to store"),
    tags: z.array(z.string()).optional().describe("Optional tags for organization"),
    source: z.string().optional().describe("Where this knowledge came from (e.g. 'conversation', 'import')"),
  }),
  execute: async ({ category, content, tags, source }) => {
    try {
      const kb = getKB();
      const entry = await kb.add(category as KBCategory, content, { tags, source });
      return `Stored in KB: ${entry.category}/${entry.id} (${content.slice(0, 60)}${content.length > 60 ? "..." : ""})`;
    } catch (err) {
      return `[kb error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const kbSearchTool = tool({
  description:
    "Search the knowledge base using hybrid semantic + keyword search. " +
    "Returns the most relevant entries. Use this to recall stored facts, " +
    "personality traits, procedures, or any persistent knowledge.",
  parameters: z.object({
    query: z.string().describe("Natural language search query"),
    category: z.enum(CATEGORIES).optional().describe("Filter by category"),
    limit: z.number().optional().describe("Max results (default: 5)"),
  }),
  execute: async ({ query, category, limit }) => {
    try {
      const kb = getKB();
      const results = await kb.search(query, {
        category: category as KBCategory | undefined,
        limit: limit ?? 5,
      });
      if (results.length === 0) {
        return `No KB matches for "${query}".`;
      }
      return results.map((r) => {
        const tagStr = r.entry.tags.length > 0 ? ` [${r.entry.tags.join(", ")}]` : "";
        return `[${r.entry.category}/${r.entry.id}] (score: ${r.score.toFixed(3)})${tagStr}\n${r.entry.content}`;
      }).join("\n\n");
    } catch (err) {
      return `[kb error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const kbListTool = tool({
  description:
    "List entries in the knowledge base, optionally filtered by category. " +
    "Shows content previews without full details. Use kb_search for relevance-ranked results.",
  parameters: z.object({
    category: z.enum(CATEGORIES).optional().describe("Filter by category (omit for all)"),
  }),
  execute: async ({ category }) => {
    try {
      const kb = getKB();
      const entries = kb.list(category as KBCategory | undefined);
      if (entries.length === 0) {
        return category
          ? `No entries in category "${category}".`
          : "Knowledge base is empty.";
      }
      return entries.map((e) => {
        const preview = e.content.length > 80 ? e.content.slice(0, 80) + "..." : e.content;
        return `${e.category}/${e.id}: ${preview}`;
      }).join("\n");
    } catch (err) {
      return `[kb error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const kbRemoveTool = tool({
  description:
    "Remove an entry from the knowledge base by ID. " +
    "Use kb_list or kb_search to find the ID first.",
  parameters: z.object({
    id: z.string().describe("The entry ID (ULID) to remove"),
  }),
  execute: async ({ id }) => {
    try {
      const kb = getKB();
      const removed = kb.remove(id);
      return removed ? `Removed: ${id}` : `[not found] No entry with ID "${id}".`;
    } catch (err) {
      return `[kb error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
