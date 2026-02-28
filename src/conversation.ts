import fs from "node:fs";
import path from "node:path";
import type { CoreMessage } from "ai";
import { getActivePersonaHome } from "./config.js";
import { saveMemory } from "./memory/store.js";

function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function historyDir(): string {
  return path.join(getActivePersonaHome(), "conversations");
}

function historyPath(userId: string): string {
  return path.join(historyDir(), `${sanitizeUserId(userId)}.json`);
}

/**
 * Extract only text content from messages, stripping tool-call/tool-result parts.
 * Returns clean user/assistant text pairs suitable for history replay.
 */
function extractTextTurns(messages: CoreMessage[]): CoreMessage[] {
  const result: CoreMessage[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;

    if (typeof m.content === "string") {
      if (m.content) result.push({ role: m.role, content: m.content });
      continue;
    }

    if (Array.isArray(m.content)) {
      // Extract only text parts, drop tool-call / tool-result parts
      const textParts = m.content.filter(
        (p): p is { type: "text"; text: string } =>
          typeof p === "object" && p !== null && "type" in p && p.type === "text",
      );
      if (textParts.length === 0) continue;
      // Flatten to a plain string for clean history
      const text = textParts.map((p) => p.text).join("\n");
      if (text) result.push({ role: m.role, content: text });
    }
  }
  return result;
}

/**
 * Load conversation history for a specific user.
 * Returns the most recent `limit` messages.
 */
export function loadHistory(userId: string, limit: number = 100): CoreMessage[] {
  try {
    const raw = fs.readFileSync(historyPath(userId), "utf8");
    const messages = JSON.parse(raw) as CoreMessage[];
    if (!Array.isArray(messages)) return [];
    return messages.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Append new messages to a user's conversation history and save.
 * Filters to only user/assistant text turns before saving.
 * Returns any messages that were discarded during trimming.
 */
export function appendToHistory(
  userId: string,
  newMessages: CoreMessage[],
  limit: number = 100,
): CoreMessage[] {
  const existing = loadHistory(userId, limit * 2);
  const textOnly = extractTextTurns(newMessages);
  const combined = [...existing, ...textOnly];
  const trimmed = combined.slice(-limit);
  const discarded = combined.length > limit
    ? combined.slice(0, combined.length - limit)
    : [];

  const dir = historyDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(historyPath(userId), JSON.stringify(trimmed, null, 2));
  return discarded;
}

/**
 * Archive rotated messages to KB at full fidelity.
 * Writes to a dated conversation-archive file so qmd can search them.
 */
export function archiveRotatedMessages(discarded: CoreMessage[]): void {
  if (discarded.length === 0) return;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const topic = `conversation-archive-${dateStr}`;

  const entries = discarded.map((m) => {
    const role = m.role === "user" ? "User" : "Agent";
    const text = typeof m.content === "string"
      ? m.content
      : JSON.stringify(m.content);
    return `${role}: ${text}`;
  });

  const block = `## Archived ${now.toTimeString().slice(0, 5)}\n${entries.join("\n")}\n`;

  // Use saveMemory which handles file creation and qmd indexing
  const memDir = path.join(getActivePersonaHome(), "memory");
  const filename = `conversation-archive-${dateStr}.md`;
  const filePath = path.join(memDir, filename);

  fs.mkdirSync(memDir, { recursive: true });

  if (fs.existsSync(filePath)) {
    // Append to existing archive file
    const existing = fs.readFileSync(filePath, "utf8");
    saveMemory(topic, existing.replace(/^# .+\n\n/, "") + "\n" + block);
  } else {
    saveMemory(topic, block);
  }
}
