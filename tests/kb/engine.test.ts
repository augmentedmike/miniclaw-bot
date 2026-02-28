import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;
let callCount = 0;

// Mock embeddings — deterministic fake vectors based on content hash
vi.mock("@kb/embeddings.js", () => ({
  EMBEDDING_DIM: 384,
  embed: vi.fn(async (text: string) => {
    callCount++;
    const vec = new Float32Array(384);
    // Simple deterministic hash → vector: each char contributes to a dimension
    for (let i = 0; i < text.length; i++) {
      vec[i % 384] += text.charCodeAt(i) / 255;
    }
    // Normalize
    let norm = 0;
    for (let i = 0; i < 384; i++) norm += vec[i]! * vec[i]!;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < 384; i++) vec[i]! /= norm;
    return vec;
  }),
}));

describe("KBEngine", () => {
  let KBEngine: typeof import("@kb/engine.js").KBEngine;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-kb-"));
    callCount = 0;
    const mod = await import("@kb/engine.js");
    KBEngine = mod.KBEngine;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  function createEngine() {
    return new KBEngine(path.join(tmpDir, "kb", "vectors.db"));
  }

  it("creates database and tables on construction", () => {
    const engine = createEngine();
    const dbFile = path.join(tmpDir, "kb", "vectors.db");
    expect(fs.existsSync(dbFile)).toBe(true);
    engine.close();
  });

  it("adds and retrieves an entry with defaults", async () => {
    const engine = createEngine();
    const entry = await engine.add("personality", "I am a helpful assistant");
    expect(entry.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(entry.category).toBe("personality");
    expect(entry.content).toBe("I am a helpful assistant");
    expect(entry.metadata).toEqual({});
    expect(entry.tags).toEqual([]);
    expect(entry.origin).toBe("imported");
    expect(entry.confidence).toBe(0.4); // default for 'imported'
    expect(entry.volatility).toBe("stable");
    expect(entry.expiresAt).toBeNull();
    expect(entry.createdAt).toBeTruthy();

    const retrieved = engine.get(entry.id);
    expect(retrieved).toEqual(entry);
    engine.close();
  });

  it("adds entry with all provenance fields", async () => {
    const engine = createEngine();
    const entry = await engine.add("fact", "The user likes TypeScript", {
      metadata: { note: "strong preference" },
      tags: ["preferences", "programming"],
      source: "conversation-2026-01-15",
      origin: "human",
      confidence: 0.95,
      volatility: "stable",
    });
    expect(entry.origin).toBe("human");
    expect(entry.confidence).toBe(0.95);
    expect(entry.volatility).toBe("stable");
    expect(entry.metadata).toEqual({ note: "strong preference" });
    expect(entry.tags).toEqual(["preferences", "programming"]);
    expect(entry.source).toBe("conversation-2026-01-15");
    engine.close();
  });

  it("adds temporal entry with expiry", async () => {
    const engine = createEngine();
    const entry = await engine.add("fact", "Meeting is next Tuesday", {
      origin: "observed",
      volatility: "temporal",
      expiresAt: "2026-03-10T00:00:00.000Z",
    });
    expect(entry.volatility).toBe("temporal");
    expect(entry.expiresAt).toBe("2026-03-10T00:00:00.000Z");
    engine.close();
  });

  it("scholastic entries get confidence 1.0 by default", async () => {
    const engine = createEngine();
    const entry = await engine.add("procedure", "Always validate user input", { origin: "scholastic" });
    expect(entry.origin).toBe("scholastic");
    expect(entry.confidence).toBe(1.0);
    engine.close();
  });

  it("updates entry content and re-embeds", async () => {
    const engine = createEngine();
    const original = await engine.add("fact", "User likes Python");
    const embedsBefore = callCount;

    const updated = await engine.update(original.id, "User prefers TypeScript over Python");
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe("User prefers TypeScript over Python");
    expect(updated!.id).toBe(original.id);
    expect(callCount).toBe(embedsBefore + 1); // re-embedded

    const fetched = engine.get(original.id);
    expect(fetched!.content).toBe("User prefers TypeScript over Python");
    engine.close();
  });

  it("update returns null for non-existent id", async () => {
    const engine = createEngine();
    const result = await engine.update("NONEXISTENT0000000000000000", "test");
    expect(result).toBeNull();
    engine.close();
  });

  it("removes an entry from all tables", async () => {
    const engine = createEngine();
    const entry = await engine.add("general", "Something to remove");
    expect(engine.remove(entry.id)).toBe(true);
    expect(engine.get(entry.id)).toBeNull();
    expect(engine.remove(entry.id)).toBe(false);
    engine.close();
  });

  it("lists entries, optionally filtered by category", async () => {
    const engine = createEngine();
    await engine.add("personality", "I am friendly");
    await engine.add("fact", "User is a developer");
    await engine.add("personality", "I use informal language");

    const all = engine.list();
    expect(all).toHaveLength(3);

    const personalities = engine.list("personality");
    expect(personalities).toHaveLength(2);
    expect(personalities.every((e) => e.category === "personality")).toBe(true);

    const facts = engine.list("fact");
    expect(facts).toHaveLength(1);
    engine.close();
  });

  it("vector search returns relevant results", async () => {
    const engine = createEngine();
    await engine.add("personality", "I am a helpful AI assistant");
    await engine.add("fact", "The capital of France is Paris");
    await engine.add("procedure", "When asked about weather, use the web_search tool");

    const results = await engine.search("helpful assistant", { method: "vector", limit: 3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.method).toBe("vector");
    expect(results[0]!.score).toBeGreaterThan(0);
    engine.close();
  });

  it("keyword search returns matching results", async () => {
    const engine = createEngine();
    await engine.add("fact", "The capital of France is Paris");
    await engine.add("fact", "The capital of Germany is Berlin");
    await engine.add("procedure", "Always greet the user warmly");

    const results = await engine.search("capital France", { method: "keyword", limit: 5, ranked: false });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.method).toBe("keyword");
    // France matches both "capital" and "France", should rank first without trust weighting
    expect(results[0]!.entry.content).toContain("France");
    engine.close();
  });

  it("hybrid search merges vector and keyword via RRF", async () => {
    const engine = createEngine();
    await engine.add("personality", "I am a friendly AI");
    await engine.add("fact", "JavaScript is a programming language");
    await engine.add("procedure", "For code questions, write clean code");

    const results = await engine.search("friendly AI assistant", { method: "hybrid", limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.method).toBe("hybrid");
    engine.close();
  });

  it("search filters by category", async () => {
    const engine = createEngine();
    await engine.add("personality", "I am helpful");
    await engine.add("fact", "Helpful fact about cats");

    const results = await engine.search("helpful", { method: "keyword", category: "fact", limit: 5 });
    expect(results.every((r) => r.entry.category === "fact")).toBe(true);
    engine.close();
  });

  it("search respects threshold", async () => {
    const engine = createEngine();
    await engine.add("fact", "Random fact one");
    await engine.add("fact", "Random fact two");

    const results = await engine.search("fact", { method: "keyword", threshold: 0.99, limit: 5 });
    // With a very high threshold, few or no results should pass
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0.99);
    }
    engine.close();
  });

  it("list filters by origin", async () => {
    const engine = createEngine();
    await engine.add("fact", "Curated fact", { origin: "scholastic" });
    await engine.add("fact", "User said this", { origin: "human" });
    await engine.add("fact", "Agent figured it out", { origin: "inferred" });

    const scholastic = engine.list(undefined, "scholastic");
    expect(scholastic).toHaveLength(1);
    expect(scholastic[0]!.origin).toBe("scholastic");

    const human = engine.list("fact", "human");
    expect(human).toHaveLength(1);
    engine.close();
  });

  it("search filters by origin", async () => {
    const engine = createEngine();
    await engine.add("fact", "Curated design principle", { origin: "scholastic" });
    await engine.add("fact", "User mentioned design", { origin: "human" });

    const results = await engine.search("design", { method: "keyword", origin: "scholastic", limit: 5 });
    expect(results.every((r) => r.entry.origin === "scholastic")).toBe(true);
    engine.close();
  });

  it("ranked search boosts high-trust origins", async () => {
    const engine = createEngine();
    // Same content, different origins
    await engine.add("fact", "Always use TypeScript strict mode", { origin: "scholastic" });
    await engine.add("fact", "Always use TypeScript strict mode maybe", { origin: "inferred" });

    const results = await engine.search("TypeScript strict mode", { method: "keyword", limit: 5 });
    // Scholastic should rank higher due to origin weight + confidence
    expect(results.length).toBe(2);
    expect(results[0]!.entry.origin).toBe("scholastic");
    engine.close();
  });

  it("expired temporal entries are excluded from search", async () => {
    const engine = createEngine();
    await engine.add("fact", "Meeting is tomorrow", {
      origin: "observed",
      volatility: "temporal",
      expiresAt: "2020-01-01T00:00:00.000Z", // long expired
    });
    await engine.add("fact", "Regular fact about meetings");

    const results = await engine.search("meeting", { method: "keyword", limit: 5 });
    // Expired entry should be filtered out
    expect(results.every((r) => r.entry.volatility !== "temporal" || !r.entry.expiresAt || r.entry.expiresAt >= new Date().toISOString())).toBe(true);
    engine.close();
  });

  it("pruneExpired removes expired temporal entries", async () => {
    const engine = createEngine();
    await engine.add("fact", "Expired meeting", {
      volatility: "temporal",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    await engine.add("fact", "Still valid");

    const pruned = engine.pruneExpired();
    expect(pruned).toBe(1);
    expect(engine.list()).toHaveLength(1);
    engine.close();
  });

  it("stats returns correct counts including origin breakdown", async () => {
    const engine = createEngine();
    await engine.add("personality", "Entry one", { origin: "scholastic" });
    await engine.add("fact", "Entry two", { origin: "human" });
    await engine.add("fact", "Entry three", { origin: "human" });

    const s = engine.stats();
    expect(s.total).toBe(3);
    expect(s.byCategory.personality).toBe(1);
    expect(s.byCategory.fact).toBe(2);
    expect(s.byCategory.procedure).toBe(0);
    expect(s.byCategory.general).toBe(0);
    expect(s.byOrigin.scholastic).toBe(1);
    expect(s.byOrigin.human).toBe(2);
    expect(s.byOrigin.inferred).toBe(0);
    expect(s.dbSizeBytes).toBeGreaterThan(0);
    engine.close();
  });

  it("rebuild embeddings re-embeds all entries", async () => {
    const engine = createEngine();
    await engine.add("fact", "First entry");
    await engine.add("fact", "Second entry");

    const embedsBefore = callCount;
    const rebuilt = await engine.rebuildEmbeddings();
    expect(rebuilt).toBe(2);
    expect(callCount).toBe(embedsBefore + 2);
    engine.close();
  });

  it("rebuild FTS re-indexes all entries", async () => {
    const engine = createEngine();
    await engine.add("fact", "Searchable content");
    const rebuilt = engine.rebuildFts();
    expect(rebuilt).toBe(1);

    // Verify FTS still works after rebuild
    const results = await engine.search("searchable", { method: "keyword", limit: 5 });
    expect(results.length).toBe(1);
    engine.close();
  });

  it("generates unique ULIDs for rapid inserts", async () => {
    const engine = createEngine();
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const entry = await engine.add("general", `Entry ${i}`);
      ids.add(entry.id);
    }
    expect(ids.size).toBe(20);
    engine.close();
  });
});
