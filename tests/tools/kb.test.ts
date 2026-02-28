import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;
const ctx = { toolCallId: "test", messages: [] as never[], abortSignal: new AbortController().signal };

vi.mock("@src/config.js", () => ({
  getMinicawHome: () => tmpDir,
  getActivePersonaHome: () => tmpDir,
}));

// Mock embeddings — deterministic fake vectors
vi.mock("@kb/embeddings.js", () => ({
  EMBEDDING_DIM: 384,
  embed: vi.fn(async (text: string) => {
    const vec = new Float32Array(384);
    for (let i = 0; i < text.length; i++) {
      vec[i % 384] += text.charCodeAt(i) / 255;
    }
    let norm = 0;
    for (let i = 0; i < 384; i++) norm += vec[i]! * vec[i]!;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < 384; i++) vec[i]! /= norm;
    return vec;
  }),
}));

describe("kb tools", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-kbtool-"));
  });

  afterEach(() => {
    // Close any cached KB engines
    vi.resetModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("kb_add stores an entry and returns confirmation", async () => {
    const { kbAddTool } = await import("@tools/kb.js");
    const result = await kbAddTool.execute(
      { category: "personality", content: "I am friendly and helpful", tags: undefined, source: undefined },
      ctx,
    );
    expect(result).toContain("Stored in KB");
    expect(result).toContain("personality");
  });

  it("kb_search finds stored entries", async () => {
    const { getKB } = await import("@kb/index.js");
    const kb = getKB();
    await kb.add("fact", "The user prefers dark mode");
    await kb.add("fact", "The user works with TypeScript");

    const { kbSearchTool } = await import("@tools/kb.js");
    const result = await kbSearchTool.execute({ query: "dark mode", category: undefined, limit: undefined }, ctx);
    expect(result).toContain("dark mode");
  });

  it("kb_search returns empty message when no matches", async () => {
    const { kbSearchTool } = await import("@tools/kb.js");
    const result = await kbSearchTool.execute({ query: "nonexistent topic", category: undefined, limit: undefined }, ctx);
    expect(result).toContain("No KB matches");
  });

  it("kb_list shows entries", async () => {
    const { getKB } = await import("@kb/index.js");
    const kb = getKB();
    await kb.add("personality", "I am a helpful assistant");
    await kb.add("fact", "User likes coffee");

    const { kbListTool } = await import("@tools/kb.js");
    const result = await kbListTool.execute({ category: undefined }, ctx);
    expect(result).toContain("personality/");
    expect(result).toContain("fact/");
  });

  it("kb_list filters by category", async () => {
    const { getKB } = await import("@kb/index.js");
    const kb = getKB();
    await kb.add("personality", "I am friendly");
    await kb.add("fact", "User likes tea");

    const { kbListTool } = await import("@tools/kb.js");
    const result = await kbListTool.execute({ category: "fact" }, ctx);
    expect(result).toContain("fact/");
    expect(result).not.toContain("personality/");
  });

  it("kb_list shows empty message", async () => {
    const { kbListTool } = await import("@tools/kb.js");
    const result = await kbListTool.execute({ category: undefined }, ctx);
    expect(result).toContain("empty");
  });

  it("kb_remove deletes an entry", async () => {
    const { getKB } = await import("@kb/index.js");
    const kb = getKB();
    const entry = await kb.add("general", "Temporary entry");

    const { kbRemoveTool } = await import("@tools/kb.js");
    const result = await kbRemoveTool.execute({ id: entry.id }, ctx);
    expect(result).toContain("Removed");

    // Verify it's gone
    expect(kb.get(entry.id)).toBeNull();
  });

  it("kb_remove reports not found for invalid id", async () => {
    const { kbRemoveTool } = await import("@tools/kb.js");
    const result = await kbRemoveTool.execute({ id: "NONEXISTENT0000000000000000" }, ctx);
    expect(result).toContain("not found");
  });
});
