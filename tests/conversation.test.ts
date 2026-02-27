import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

vi.mock("@src/config.js", () => ({
  getMinicawHome: () => tmpDir,
}));

const { loadHistory, saveHistory, appendToHistory } = await import("@src/conversation.js");

describe("conversation history", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-conv-"));
    fs.mkdirSync(path.join(tmpDir, "conversations"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no history file", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("saves and loads messages", () => {
    const messages = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "hi there" },
    ];
    saveHistory(messages);
    const loaded = loadHistory();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toEqual({ role: "user", content: "hello" });
    expect(loaded[1]).toEqual({ role: "assistant", content: "hi there" });
  });

  it("applies sliding window on save", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }));
    saveHistory(messages, 5);
    const loaded = loadHistory(5);
    expect(loaded).toHaveLength(5);
    expect(loaded[0]).toEqual({ role: "user", content: "msg 5" });
  });

  it("applies sliding window on load", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }));
    saveHistory(messages, 100);
    const loaded = loadHistory(3);
    expect(loaded).toHaveLength(3);
    expect(loaded[0]).toEqual({ role: "user", content: "msg 7" });
  });

  it("appends new messages to existing history", () => {
    saveHistory([
      { role: "user" as const, content: "first" },
      { role: "assistant" as const, content: "reply" },
    ]);
    const result = appendToHistory([
      { role: "user" as const, content: "second" },
    ]);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ role: "user", content: "second" });
  });

  it("appendToHistory respects limit", () => {
    saveHistory(
      Array.from({ length: 48 }, (_, i) => ({
        role: "user" as const,
        content: `old ${i}`,
      })),
    );
    const result = appendToHistory(
      [
        { role: "user" as const, content: "new 1" },
        { role: "assistant" as const, content: "new 2" },
        { role: "user" as const, content: "new 3" },
      ],
      50,
    );
    expect(result).toHaveLength(50);
    expect(result[result.length - 1]).toEqual({ role: "user", content: "new 3" });
  });
});
