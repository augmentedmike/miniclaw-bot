import { searchMemory, vectorSearchMemory } from "./memory/search.js";
import { saveMemory, readMemory } from "./memory/store.js";
import type { Channel } from "./types.js";
import type { SearchResult } from "./memory/search.js";

/**
 * Pre-turn: search KB for context relevant to the current message.
 * Tries the local vector KB first (fast, no external deps), falls back
 * to qmd-based memory search if KB is empty or unavailable.
 * Returns formatted context block or empty string.
 */
export async function retrieveContext(userMessage: string): Promise<string> {
  // 1. Try local vector KB first
  try {
    const { getKB } = await import("./kb/index.js");
    const kb = getKB();
    const kbResults = await kb.search(userMessage, { limit: 5 });
    if (kbResults.length > 0) {
      const lines = kbResults.map((r) => `- [kb:${r.entry.category}] ${r.entry.content.slice(0, 200)}`);
      return lines.join("\n");
    }
  } catch {
    // KB not available — fall through to qmd
  }

  // 2. Fallback: qmd-based memory search
  let results: SearchResult[];

  try {
    results = searchMemory(userMessage, 5);
  } catch {
    return "";
  }

  if (results.length === 0) {
    try {
      results = vectorSearchMemory(userMessage, 5);
    } catch {
      return "";
    }
  }

  if (results.length === 0) return "";

  const lines = results.map((r) => `- [${r.file}] ${r.snippet}`);
  return lines.join("\n");
}

/**
 * Post-turn: save a structured KB entry summarizing the exchange.
 * Writes to both the local vector KB and the legacy qmd memory.
 * KB save is best-effort — if it fails, qmd still captures the data.
 */
export async function saveContext(
  channel: Channel,
  userMessage: string,
  agentResponse: string,
): Promise<void> {
  // Save to local vector KB (best-effort)
  try {
    const { getKB } = await import("./kb/index.js");
    const kb = getKB();
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    const summary = `[${timeStr} ${channel}] User: ${userMessage.slice(0, 300)} | Agent: ${agentResponse.slice(0, 300)}`;
    await kb.add("general", summary, { source: `conversation-${channel}` });
  } catch {
    // Non-fatal — qmd fallback below
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);
  const topic = `conversation-${dateStr}`;

  // Truncate for the summary line — keep it concise
  const userSnippet = userMessage.length > 500
    ? userMessage.slice(0, 500) + "..."
    : userMessage;
  const agentSnippet = agentResponse.length > 500
    ? agentResponse.slice(0, 500) + "..."
    : agentResponse;

  const entry = `## ${timeStr} [${channel}]\nUser: ${userSnippet}\nAgent: ${agentSnippet}\n`;

  // Append to existing daily file if it exists, otherwise create
  const existing = readMemory(topic);

  if (existing) {
    // Strip the auto-generated header and append
    const body = existing.replace(/^# .+\n\n/, "");
    saveMemory(topic, body + "\n" + entry);
  } else {
    saveMemory(topic, entry);
  }
}
