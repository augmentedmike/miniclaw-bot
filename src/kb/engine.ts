/**
 * Knowledge Base engine — SQLite + sqlite-vec + FTS5.
 *
 * Three-table design:
 *   kb_entries — canonical data (ULID id, category, content, metadata, tags, source, timestamps)
 *   kb_vec     — sqlite-vec virtual table for cosine similarity on float[384]
 *   kb_fts     — FTS5 virtual table for BM25 keyword search
 *
 * Hybrid search merges vector + keyword results via Reciprocal Rank Fusion.
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { embed, EMBEDDING_DIM } from "./embeddings.js";
import type { KBCategory, KBEntry, KBSearchResult, KBSearchOptions, KBStats } from "./types.js";

const require = createRequire(import.meta.url);

// ── ULID ────────────────────────────────────────────────────────────────────

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let lastTime = 0;

function ulid(): string {
  let now = Date.now();
  if (now <= lastTime) now = lastTime + 1;
  lastTime = now;

  // 10-char timestamp (48-bit ms since epoch, Crockford Base32)
  let ts = "";
  for (let i = 9; i >= 0; i--) {
    ts = ENCODING[now % 32]! + ts;
    now = Math.floor(now / 32);
  }

  // 16-char randomness
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand += ENCODING[Math.floor(Math.random() * 32)]!;
  }

  return ts + rand;
}

// ── Database ────────────────────────────────────────────────────────────────

type Database = ReturnType<typeof import("better-sqlite3")>;

export class KBEngine {
  private db: Database;
  readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;

    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const BetterSqlite3 = require("better-sqlite3") as typeof import("better-sqlite3");
    const sqliteVec = require("sqlite-vec") as { load: (db: Database) => void };

    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    sqliteVec.load(this.db);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kb_entries (
        id        TEXT PRIMARY KEY,
        category  TEXT NOT NULL CHECK(category IN ('personality','fact','procedure','general')),
        content   TEXT NOT NULL,
        metadata  TEXT NOT NULL DEFAULT '{}',
        tags      TEXT NOT NULL DEFAULT '[]',
        source    TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
        id UNINDEXED,
        content,
        category UNINDEXED,
        content_rowid='rowid'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS kb_vec USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[${EMBEDDING_DIM}]
      );
    `);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async add(
    category: KBCategory,
    content: string,
    opts?: { metadata?: Record<string, string>; tags?: string[]; source?: string },
  ): Promise<KBEntry> {
    const id = ulid();
    const now = new Date().toISOString();
    const metadata = opts?.metadata ?? {};
    const tags = opts?.tags ?? [];
    const source = opts?.source ?? "";

    const vector = await embed(content);

    const insertEntry = this.db.prepare(`
      INSERT INTO kb_entries (id, category, content, metadata, tags, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFts = this.db.prepare(`
      INSERT INTO kb_fts (id, content, category) VALUES (?, ?, ?)
    `);

    const insertVec = this.db.prepare(`
      INSERT INTO kb_vec (id, embedding) VALUES (?, ?)
    `);

    const tx = this.db.transaction(() => {
      insertEntry.run(id, category, content, JSON.stringify(metadata), JSON.stringify(tags), source, now, now);
      insertFts.run(id, content, category);
      insertVec.run(id, new Float32Array(vector));
    });
    tx();

    return { id, category, content, metadata, tags, source, createdAt: now, updatedAt: now };
  }

  async update(id: string, content: string): Promise<KBEntry | null> {
    const existing = this.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const vector = await embed(content);

    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE kb_entries SET content = ?, updated_at = ? WHERE id = ?`).run(content, now, id);
      this.db.prepare(`UPDATE kb_fts SET content = ? WHERE id = ?`).run(content, id);
      this.db.prepare(`DELETE FROM kb_vec WHERE id = ?`).run(id);
      this.db.prepare(`INSERT INTO kb_vec (id, embedding) VALUES (?, ?)`).run(id, new Float32Array(vector));
    });
    tx();

    return { ...existing, content, updatedAt: now };
  }

  get(id: string): KBEntry | null {
    const row = this.db.prepare(`SELECT * FROM kb_entries WHERE id = ?`).get(id) as EntryRow | undefined;
    return row ? rowToEntry(row) : null;
  }

  list(category?: KBCategory): KBEntry[] {
    const sql = category
      ? `SELECT * FROM kb_entries WHERE category = ? ORDER BY created_at DESC`
      : `SELECT * FROM kb_entries ORDER BY created_at DESC`;
    const rows = (category
      ? this.db.prepare(sql).all(category)
      : this.db.prepare(sql).all()) as EntryRow[];
    return rows.map(rowToEntry);
  }

  remove(id: string): boolean {
    const tx = this.db.transaction(() => {
      const changes = this.db.prepare(`DELETE FROM kb_entries WHERE id = ?`).run(id).changes;
      this.db.prepare(`DELETE FROM kb_fts WHERE id = ?`).run(id);
      this.db.prepare(`DELETE FROM kb_vec WHERE id = ?`).run(id);
      return changes > 0;
    });
    return tx();
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async search(query: string, opts?: KBSearchOptions): Promise<KBSearchResult[]> {
    const method = opts?.method ?? "hybrid";
    const limit = opts?.limit ?? 10;
    const threshold = opts?.threshold ?? 0;

    let results: KBSearchResult[];

    switch (method) {
      case "vector":
        results = await this.vectorSearch(query, limit, opts?.category);
        break;
      case "keyword":
        results = this.keywordSearch(query, limit, opts?.category);
        break;
      case "hybrid":
      default:
        results = await this.hybridSearch(query, limit, opts?.category);
        break;
    }

    if (threshold > 0) {
      results = results.filter((r) => r.score >= threshold);
    }

    return results;
  }

  private async vectorSearch(query: string, limit: number, category?: KBCategory): Promise<KBSearchResult[]> {
    const queryVec = await embed(query);

    const rows = this.db.prepare(`
      SELECT v.id, v.distance
      FROM kb_vec v
      WHERE embedding MATCH ?
      ORDER BY v.distance
      LIMIT ?
    `).all(new Float32Array(queryVec), limit) as { id: string; distance: number }[];

    const results: KBSearchResult[] = [];
    for (const row of rows) {
      const entry = this.get(row.id);
      if (!entry) continue;
      if (category && entry.category !== category) continue;
      // sqlite-vec returns cosine distance; convert to similarity (1 - distance)
      results.push({ entry, score: 1 - row.distance, method: "vector" });
    }
    return results;
  }

  private keywordSearch(query: string, limit: number, category?: KBCategory): KBSearchResult[] {
    // Escape FTS5 special characters and build query
    const ftsQuery = query
      .replace(/['"]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"`)
      .join(" OR ");

    if (!ftsQuery) return [];

    const rows = this.db.prepare(`
      SELECT id, rank
      FROM kb_fts
      WHERE content MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit * 2) as { id: string; rank: number }[];

    const results: KBSearchResult[] = [];
    for (const row of rows) {
      const entry = this.get(row.id);
      if (!entry) continue;
      if (category && entry.category !== category) continue;
      // FTS5 rank is negative (lower = better); normalize to 0..1 range
      results.push({ entry, score: 1 / (1 + Math.abs(row.rank)), method: "keyword" });
    }
    return results.slice(0, limit);
  }

  private async hybridSearch(query: string, limit: number, category?: KBCategory): Promise<KBSearchResult[]> {
    // Run both searches
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(query, limit, category),
      Promise.resolve(this.keywordSearch(query, limit, category)),
    ]);

    // Reciprocal Rank Fusion (k=60)
    const k = 60;
    const scores = new Map<string, { entry: KBEntry; score: number }>();

    for (let i = 0; i < vectorResults.length; i++) {
      const r = vectorResults[i]!;
      const rrf = 1 / (k + i + 1);
      const existing = scores.get(r.entry.id);
      if (existing) {
        existing.score += rrf;
      } else {
        scores.set(r.entry.id, { entry: r.entry, score: rrf });
      }
    }

    for (let i = 0; i < keywordResults.length; i++) {
      const r = keywordResults[i]!;
      const rrf = 1 / (k + i + 1);
      const existing = scores.get(r.entry.id);
      if (existing) {
        existing.score += rrf;
      } else {
        scores.set(r.entry.id, { entry: r.entry, score: rrf });
      }
    }

    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ entry, score }) => ({ entry, score, method: "hybrid" as const }));
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  stats(): KBStats {
    const total = (this.db.prepare(`SELECT COUNT(*) as count FROM kb_entries`).get() as { count: number }).count;

    const categories: KBCategory[] = ["personality", "fact", "procedure", "general"];
    const byCategory = {} as Record<KBCategory, number>;
    for (const cat of categories) {
      byCategory[cat] = (this.db.prepare(`SELECT COUNT(*) as count FROM kb_entries WHERE category = ?`).get(cat) as { count: number }).count;
    }

    let dbSizeBytes = 0;
    try {
      dbSizeBytes = fs.statSync(this.dbPath).size;
    } catch {
      // DB might be in-memory
    }

    return { total, byCategory, dbSizeBytes };
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  /** Rebuild all embeddings (e.g., after model upgrade). */
  async rebuildEmbeddings(): Promise<number> {
    const entries = this.list();
    this.db.exec(`DELETE FROM kb_vec`);

    const insertVec = this.db.prepare(`INSERT INTO kb_vec (id, embedding) VALUES (?, ?)`);

    let count = 0;
    for (const entry of entries) {
      const vector = await embed(entry.content);
      insertVec.run(entry.id, new Float32Array(vector));
      count++;
    }
    return count;
  }

  /** Rebuild FTS index from kb_entries. */
  rebuildFts(): number {
    this.db.exec(`DELETE FROM kb_fts`);
    const entries = this.list();
    const insertFts = this.db.prepare(`INSERT INTO kb_fts (id, content, category) VALUES (?, ?, ?)`);
    for (const entry of entries) {
      insertFts.run(entry.id, entry.content, entry.category);
    }
    return entries.length;
  }

  close(): void {
    this.db.close();
  }
}

// ── Row mapping ─────────────────────────────────────────────────────────────

type EntryRow = {
  id: string;
  category: string;
  content: string;
  metadata: string;
  tags: string;
  source: string;
  created_at: string;
  updated_at: string;
};

function rowToEntry(row: EntryRow): KBEntry {
  return {
    id: row.id,
    category: row.category as KBCategory,
    content: row.content,
    metadata: JSON.parse(row.metadata) as Record<string, string>,
    tags: JSON.parse(row.tags) as string[],
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
