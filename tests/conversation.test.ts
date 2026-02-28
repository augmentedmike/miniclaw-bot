import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("conversation", () => {
  let tmpDir: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-conv-"));
    process.env.HOME = tmpDir;
    delete process.env.MINICLAW_HOME;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    vi.resetModules();
  });

  it("returns empty array when no history exists", async () => {
    const { loadHistory } = await import("@src/conversation.js");
    const history = loadHistory("test-user");
    expect(history).toEqual([]);
  });

  it("appends and loads user/assistant messages", async () => {
    const { loadHistory, appendToHistory } = await import("@src/conversation.js");
    appendToHistory("user-1", [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
    const history = loadHistory("user-1");
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", content: "hello" });
    expect(history[1]).toEqual({ role: "assistant", content: "hi there" });
  });

  it("filters out tool-call messages", async () => {
    const { loadHistory, appendToHistory } = await import("@src/conversation.js");
    appendToHistory("user-2", [
      { role: "user", content: "run ls" },
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "1", toolName: "shell_exec", args: { command: "ls" } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "1", result: "file.txt" }] },
      { role: "assistant", content: "Here are your files" },
    ]);
    const history = loadHistory("user-2");
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe("user");
    expect(history[1].content).toBe("Here are your files");
  });

  it("trims history to limit", async () => {
    const { loadHistory, appendToHistory } = await import("@src/conversation.js");
    const msgs = [];
    for (let i = 0; i < 10; i++) {
      msgs.push({ role: "user" as const, content: `msg-${i}` });
      msgs.push({ role: "assistant" as const, content: `reply-${i}` });
    }
    appendToHistory("user-3", msgs, 6);
    const history = loadHistory("user-3", 6);
    expect(history).toHaveLength(6);
    // Should keep the most recent messages
    expect(history[0].content).toBe("msg-7");
    expect(history[5].content).toBe("reply-9");
  });

  it("keeps separate history per user", async () => {
    const { loadHistory, appendToHistory } = await import("@src/conversation.js");
    appendToHistory("alice", [
      { role: "user", content: "I am Alice" },
      { role: "assistant", content: "Hello Alice" },
    ]);
    appendToHistory("bob", [
      { role: "user", content: "I am Bob" },
      { role: "assistant", content: "Hello Bob" },
    ]);
    const aliceHistory = loadHistory("alice");
    const bobHistory = loadHistory("bob");
    expect(aliceHistory).toHaveLength(2);
    expect(bobHistory).toHaveLength(2);
    expect(aliceHistory[0].content).toBe("I am Alice");
    expect(bobHistory[0].content).toBe("I am Bob");
  });

  it("sanitizes userId for filesystem safety", async () => {
    const { loadHistory, appendToHistory } = await import("@src/conversation.js");
    appendToHistory("user/../evil", [
      { role: "user", content: "test" },
    ]);
    // Should create a safely-named file, not traverse directories
    const convDir = path.join(tmpDir, ".miniclaw", "user", "personas", "default", "conversations");
    const files = fs.readdirSync(convDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe("user____evil.json");
    expect(loadHistory("user/../evil")).toHaveLength(1);
  });

  it("appends to existing history across calls", async () => {
    const { loadHistory, appendToHistory } = await import("@src/conversation.js");
    appendToHistory("user-4", [
      { role: "user", content: "first" },
      { role: "assistant", content: "reply-1" },
    ]);
    appendToHistory("user-4", [
      { role: "user", content: "second" },
      { role: "assistant", content: "reply-2" },
    ]);
    const history = loadHistory("user-4");
    expect(history).toHaveLength(4);
    expect(history[0].content).toBe("first");
    expect(history[3].content).toBe("reply-2");
  });

  it("extracts text from mixed text+tool-call assistant messages", async () => {
    const { loadHistory, appendToHistory } = await import("@src/conversation.js");
    appendToHistory("user-5", [
      { role: "user", content: "search for foo" },
      { role: "assistant", content: [
        { type: "text", text: "I'll search for that." },
        { type: "tool-call", toolCallId: "1", toolName: "memory_search", args: { query: "foo" } },
      ] },
    ]);
    const history = loadHistory("user-5");
    expect(history).toHaveLength(2);
    // Should have flattened to plain text, no tool-call parts
    expect(history[1].content).toBe("I'll search for that.");
    expect(typeof history[1].content).toBe("string");
  });

  it("handles corrupted JSON gracefully", async () => {
    const { loadHistory } = await import("@src/conversation.js");
    const convDir = path.join(tmpDir, ".miniclaw", "user", "personas", "default", "conversations");
    fs.mkdirSync(convDir, { recursive: true });
    fs.writeFileSync(path.join(convDir, "bad-user.json"), "not json{{{");
    const history = loadHistory("bad-user");
    expect(history).toEqual([]);
  });

  it("returns discarded messages when history exceeds limit", async () => {
    const { appendToHistory } = await import("@src/conversation.js");
    const msgs = [];
    for (let i = 0; i < 10; i++) {
      msgs.push({ role: "user" as const, content: `msg-${i}` });
      msgs.push({ role: "assistant" as const, content: `reply-${i}` });
    }
    // Limit of 6 means 14 messages get discarded
    const discarded = appendToHistory("user-discard", msgs, 6);
    expect(discarded).toHaveLength(14);
    expect(discarded[0].content).toBe("msg-0");
    expect(discarded[13].content).toBe("reply-6");
  });

  it("returns empty array when no messages are discarded", async () => {
    const { appendToHistory } = await import("@src/conversation.js");
    const discarded = appendToHistory("user-nodelete", [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ], 100);
    expect(discarded).toEqual([]);
  });

  it("archiveRotatedMessages writes full-text entries to memory", async () => {
    const { archiveRotatedMessages } = await import("@src/conversation.js");
    const discarded = [
      { role: "user" as const, content: "important old message" },
      { role: "assistant" as const, content: "important old reply" },
    ];
    archiveRotatedMessages(discarded);

    // Check that a conversation-archive file was created in memory dir
    const memDir = path.join(tmpDir, ".miniclaw", "user", "personas", "default", "memory");
    const files = fs.readdirSync(memDir).filter(f => f.startsWith("conversation-archive-"));
    expect(files.length).toBeGreaterThanOrEqual(1);

    const content = fs.readFileSync(path.join(memDir, files[0]), "utf8");
    expect(content).toContain("important old message");
    expect(content).toContain("important old reply");
    expect(content).toContain("User:");
    expect(content).toContain("Agent:");
  });

  it("archiveRotatedMessages is a no-op for empty array", async () => {
    const { archiveRotatedMessages } = await import("@src/conversation.js");
    // Should not throw or create files
    archiveRotatedMessages([]);
    const memDir = path.join(tmpDir, ".miniclaw", "user", "personas", "default", "memory");
    try {
      const files = fs.readdirSync(memDir).filter(f => f.startsWith("conversation-archive-"));
      expect(files).toHaveLength(0);
    } catch {
      // memory dir doesn't exist yet — that's fine
    }
  });
});
