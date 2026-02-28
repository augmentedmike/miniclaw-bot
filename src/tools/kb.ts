/**
 * Knowledge Base tools for the agent.
 *
 * Provides structured, semantically searchable persistent storage.
 * Uses local SQLite + vector embeddings for hybrid search.
 * Search results are ranked by: relevance * origin_trust * confidence * freshness.
 */

import { z } from "zod";
import { tool } from "ai";
import { getKB } from "../kb/index.js";
import type { KBCategory, KBOrigin, KBVolatility } from "../kb/types.js";

const CATEGORIES = ["personality", "fact", "procedure", "general"] as const;
const ORIGINS = ["scholastic", "human", "observed", "read", "inferred", "imported"] as const;
const VOLATILITIES = ["stable", "temporal", "versioned"] as const;

export const kbAddTool = tool({
  description:
    "Add an entry to the knowledge base. Use this to store personality traits, " +
    "learned facts, operating procedures, or other persistent knowledge. " +
    "Entries are embedded for semantic search on insert. " +
    "Set origin to indicate provenance: 'scholastic' (curated curriculum), " +
    "'human' (user told you), 'observed' (you witnessed it), 'read' (extracted from a document), " +
    "'inferred' (you reasoned it out), 'imported' (bulk loaded).",
  parameters: z.object({
    category: z.enum(CATEGORIES).describe("Category: personality, fact, procedure, or general"),
    content: z.string().describe("The content to store"),
    origin: z.enum(ORIGINS).optional().describe("How you know this (default: inferred)"),
    confidence: z.number().min(0).max(1).optional().describe("How sure you are, 0–1 (default: based on origin)"),
    volatility: z.enum(VOLATILITIES).optional().describe("stable (default), temporal (has expiry), versioned (may become stale)"),
    expires_at: z.string().optional().describe("ISO date when this expires (only for temporal entries)"),
    tags: z.array(z.string()).optional().describe("Optional tags for organization"),
    source: z.string().optional().describe("Mechanical provenance — which conversation, URL, or file"),
  }),
  execute: async ({ category, content, origin, confidence, volatility, expires_at, tags, source }) => {
    try {
      const kb = getKB();
      const entry = await kb.add(category as KBCategory, content, {
        origin: origin as KBOrigin | undefined,
        confidence,
        volatility: volatility as KBVolatility | undefined,
        expiresAt: expires_at,
        tags,
        source,
      });
      return `Stored in KB: ${entry.category}/${entry.id} [${entry.origin}, conf=${entry.confidence.toFixed(1)}] (${content.slice(0, 60)}${content.length > 60 ? "..." : ""})`;
    } catch (err) {
      return `[kb error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const kbSearchTool = tool({
  description:
    "Search the knowledge base using hybrid semantic + keyword search. " +
    "Results are ranked by relevance * origin_trust * confidence * freshness. " +
    "Scholastic and human-sourced entries rank higher than inferred ones. " +
    "Expired temporal entries are automatically excluded.",
  parameters: z.object({
    query: z.string().describe("Natural language search query"),
    category: z.enum(CATEGORIES).optional().describe("Filter by category"),
    origin: z.enum(ORIGINS).optional().describe("Filter by origin"),
    limit: z.number().optional().describe("Max results (default: 5)"),
  }),
  execute: async ({ query, category, origin, limit }) => {
    try {
      const kb = getKB();
      const results = await kb.search(query, {
        category: category as KBCategory | undefined,
        origin: origin as KBOrigin | undefined,
        limit: limit ?? 5,
      });
      if (results.length === 0) {
        return `No KB matches for "${query}".`;
      }
      return results.map((r) => {
        const tagStr = r.entry.tags.length > 0 ? ` [${r.entry.tags.join(", ")}]` : "";
        const meta = `${r.entry.origin}, conf=${r.entry.confidence.toFixed(1)}`;
        return `[${r.entry.category}/${r.entry.id}] (score: ${r.score.toFixed(4)}, ${meta})${tagStr}\n${r.entry.content}`;
      }).join("\n\n");
    } catch (err) {
      return `[kb error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const kbListTool = tool({
  description:
    "List entries in the knowledge base, optionally filtered by category or origin. " +
    "Shows content previews without full details. Use kb_search for relevance-ranked results.",
  parameters: z.object({
    category: z.enum(CATEGORIES).optional().describe("Filter by category (omit for all)"),
    origin: z.enum(ORIGINS).optional().describe("Filter by origin (omit for all)"),
  }),
  execute: async ({ category, origin }) => {
    try {
      const kb = getKB();
      const entries = kb.list(
        category as KBCategory | undefined,
        origin as KBOrigin | undefined,
      );
      if (entries.length === 0) {
        const filter = [category, origin].filter(Boolean).join(", ") || "any";
        return `No entries matching (${filter}).`;
      }
      return entries.map((e) => {
        const preview = e.content.length > 80 ? e.content.slice(0, 80) + "..." : e.content;
        return `${e.category}/${e.id} [${e.origin}]: ${preview}`;
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
