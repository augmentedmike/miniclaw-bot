import fs from "node:fs";
import path from "node:path";
import type { CoreMessage } from "ai";
import { getMinicawHome } from "./config.js";

function historyPath(): string {
  return path.join(getMinicawHome(), "conversations", "history.json");
}

/**
 * Load unified conversation history.
 * Returns the most recent `limit` messages.
 */
export function loadHistory(limit: number = 50): CoreMessage[] {
  try {
    const raw = fs.readFileSync(historyPath(), "utf8");
    const messages = JSON.parse(raw) as CoreMessage[];
    if (!Array.isArray(messages)) return [];
    // Return only the most recent messages
    return messages.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Save conversation history, applying the sliding window.
 */
export function saveHistory(messages: CoreMessage[], limit: number = 50): void {
  const trimmed = messages.slice(-limit);
  const dir = path.dirname(historyPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(historyPath(), JSON.stringify(trimmed, null, 2));
}

/**
 * Append new messages to the existing history and save.
 */
export function appendToHistory(
  newMessages: CoreMessage[],
  limit: number = 50,
): CoreMessage[] {
  const existing = loadHistory(limit * 2); // Load more to avoid losing context
  const combined = [...existing, ...newMessages];
  saveHistory(combined, limit);
  return combined.slice(-limit);
}
