/**
 * Knowledge Base engine — SQLite + sqlite-vec + FTS5.
 *
 * Three-table design:
 *   kb_entries — canonical data (ULID id, category, content, metadata, tags, source,
 *                origin, confidence, volatility, expires_at, timestamps)
 *   kb_vec     — sqlite-vec virtual table for cosine similarity on float[384]
 *   kb_fts     — FTS5 virtual table for BM25 keyword search
 *
 * Hybrid search merges vector + keyword results via Reciprocal Rank Fusion,
 * then applies trust weighting: origin_weight * confidence * freshness_decay.
 */

import fs from "node:fs";
import path from "node:path";
import { embed, EMBEDDING_DIM } from "./embeddings.js";
import type {
  KBCategory, KBOrigin, KBVolatility, KBEntry,
  KBSearchResult, KBSearchOptions, KBStats,
} from "./types.js";
import { ORIGIN_WEIGHTS } from "./types.js";

// createRequire + require are provided by the esbuild banner

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

// ── Freshness decay ─────────────────────────────────────────────────────────

/** Half-life decay: entries lose half their freshness boost every `halfLifeDays`. */
function freshnessMultiplier(createdAt: string, halfLifeDays = 90): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  // Decay from 1.0 → 0.5 over halfLifeDays, floor at 0.25
  return Math.max(0.25, Math.pow(0.5, ageDays / halfLifeDays));
}

// ── Database ────────────────────────────────────────────────────────────────

type Database = ReturnType<typeof import("better-sqlite3")>;

export type AddOptions = {
  metadata?: Record<string, string>;
  tags?: string[];
  source?: string;
  origin?: KBOrigin;
  confidence?: number;
  volatility?: KBVolatility;
  expiresAt?: string;
};

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
        id          TEXT PRIMARY KEY,
        category    TEXT NOT NULL CHECK(category IN ('personality','fact','procedure','general')),
        content     TEXT NOT NULL,
        metadata    TEXT NOT NULL DEFAULT '{}',
        tags        TEXT NOT NULL DEFAULT '[]',
        source      TEXT NOT NULL DEFAULT '',
        origin      TEXT NOT NULL DEFAULT 'imported' CHECK(origin IN ('scholastic','human','observed','read','inferred','imported')),
        confidence  REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
        volatility  TEXT NOT NULL DEFAULT 'stable' CHECK(volatility IN ('stable','temporal','versioned')),
        expires_at  TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
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

    // Migrate older DBs that lack the new columns
    this.migrate();
  }

  private migrate(): void {
    const cols = this.db.prepare(`PRAGMA table_info(kb_entries)`).all() as { name: string }[];
    const colNames = new Set(cols.map((c) => c.name));

    if (!colNames.has("origin")) {
      this.db.exec(`ALTER TABLE kb_entries ADD COLUMN origin TEXT NOT NULL DEFAULT 'imported' CHECK(origin IN ('scholastic','human','observed','read','inferred','imported'))`);
    }
    if (!colNames.has("confidence")) {
      this.db.exec(`ALTER TABLE kb_entries ADD COLUMN confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1)`);
    }
    if (!colNames.has("volatility")) {
      this.db.exec(`ALTER TABLE kb_entries ADD COLUMN volatility TEXT NOT NULL DEFAULT 'stable' CHECK(volatility IN ('stable','temporal','versioned'))`);
    }
    if (!colNames.has("expires_at")) {
      this.db.exec(`ALTER TABLE kb_entries ADD COLUMN expires_at TEXT`);
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async add(category: KBCategory, content: string, opts?: AddOptions): Promise<KBEntry> {
    const id = ulid();
    const now = new Date().toISOString();
    const metadata = opts?.metadata ?? {};
    const tags = opts?.tags ?? [];
    const source = opts?.source ?? "";
    const origin = opts?.origin ?? "imported";
    const confidence = opts?.confidence ?? defaultConfidence(origin);
    const volatility = opts?.volatility ?? "stable";
    const expiresAt = opts?.expiresAt ?? null;

    const vector = await embed(content);

    const insertEntry = this.db.prepare(`
      INSERT INTO kb_entries (id, category, content, metadata, tags, source, origin, confidence, volatility, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFts = this.db.prepare(`
      INSERT INTO kb_fts (id, content, category) VALUES (?, ?, ?)
    `);

    const insertVec = this.db.prepare(`
      INSERT INTO kb_vec (id, embedding) VALUES (?, ?)
    `);

    const tx = this.db.transaction(() => {
      insertEntry.run(id, category, content, JSON.stringify(metadata), JSON.stringify(tags), source, origin, confidence, volatility, expiresAt, now, now);
      insertFts.run(id, content, category);
      insertVec.run(id, new Float32Array(vector));
    });
    tx();

    return { id, category, content, metadata, tags, source, origin, confidence, volatility, expiresAt, createdAt: now, updatedAt: now };
  }

  async update(id: string, content: string, opts?: { confidence?: number; volatility?: KBVolatility; expiresAt?: string | null }): Promise<KBEntry | null> {
    const existing = this.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const confidence = opts?.confidence ?? existing.confidence;
    const volatility = opts?.volatility ?? existing.volatility;
    const expiresAt = opts?.expiresAt !== undefined ? opts.expiresAt : existing.expiresAt;
    const vector = await embed(content);

    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE kb_entries SET content = ?, confidence = ?, volatility = ?, expires_at = ?, updated_at = ? WHERE id = ?`)
        .run(content, confidence, volatility, expiresAt, now, id);
      this.db.prepare(`UPDATE kb_fts SET content = ? WHERE id = ?`).run(content, id);
      this.db.prepare(`DELETE FROM kb_vec WHERE id = ?`).run(id);
      this.db.prepare(`INSERT INTO kb_vec (id, embedding) VALUES (?, ?)`).run(id, new Float32Array(vector));
    });
    tx();

    return { ...existing, content, confidence, volatility, expiresAt, updatedAt: now };
  }

  get(id: string): KBEntry | null {
    const row = this.db.prepare(`SELECT * FROM kb_entries WHERE id = ?`).get(id) as EntryRow | undefined;
    return row ? rowToEntry(row) : null;
  }

  list(category?: KBCategory, origin?: KBOrigin): KBEntry[] {
    let sql = `SELECT * FROM kb_entries`;
    const conditions: string[] = [];
    const params: string[] = [];

    if (category) { conditions.push(`category = ?`); params.push(category); }
    if (origin) { conditions.push(`origin = ?`); params.push(origin); }

    if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
    sql += ` ORDER BY created_at DESC`;

    const rows = this.db.prepare(sql).all(...params) as EntryRow[];
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
    const ranked = opts?.ranked !== false; // default true

    let results: KBSearchResult[];

    switch (method) {
      case "vector":
        results = await this.vectorSearch(query, limit, opts?.category, opts?.origin);
        break;
      case "keyword":
        results = this.keywordSearch(query, limit, opts?.category, opts?.origin);
        break;
      case "hybrid":
      default:
        results = await this.hybridSearch(query, limit, opts?.category, opts?.origin);
        break;
    }

    // Filter expired temporal entries
    const now = new Date().toISOString();
    results = results.filter((r) => {
      if (r.entry.volatility === "temporal" && r.entry.expiresAt && r.entry.expiresAt < now) {
        return false;
      }
      return true;
    });

    // Apply trust weighting: origin_weight * confidence * freshness_decay
    if (ranked) {
      for (const r of results) {
        const originWeight = ORIGIN_WEIGHTS[r.entry.origin] ?? 0.5;
        const freshness = freshnessMultiplier(r.entry.createdAt);
        r.score = r.score * originWeight * r.entry.confidence * freshness;
      }
      results.sort((a, b) => b.score - a.score);
    }

    if (threshold > 0) {
      results = results.filter((r) => r.score >= threshold);
    }

    return results.slice(0, limit);
  }

  private async vectorSearch(query: string, limit: number, category?: KBCategory, origin?: KBOrigin): Promise<KBSearchResult[]> {
    const queryVec = await embed(query);

    // Fetch extra to allow for post-filtering
    const fetchLimit = limit * 3;
    const rows = this.db.prepare(`
      SELECT v.id, v.distance
      FROM kb_vec v
      WHERE embedding MATCH ?
      ORDER BY v.distance
      LIMIT ?
    `).all(new Float32Array(queryVec), fetchLimit) as { id: string; distance: number }[];

    const results: KBSearchResult[] = [];
    for (const row of rows) {
      const entry = this.get(row.id);
      if (!entry) continue;
      if (category && entry.category !== category) continue;
      if (origin && entry.origin !== origin) continue;
      // sqlite-vec returns cosine distance; convert to similarity (1 - distance)
      results.push({ entry, score: 1 - row.distance, method: "vector" });
      if (results.length >= limit) break;
    }
    return results;
  }

  private keywordSearch(query: string, limit: number, category?: KBCategory, origin?: KBOrigin): KBSearchResult[] {
    // Escape FTS5 special characters and build query
    const ftsQuery = query
      .replace(/['"]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"`)
      .join(" OR ");

    if (!ftsQuery) return [];

    const fetchLimit = limit * 3;
    const rows = this.db.prepare(`
      SELECT id, rank
      FROM kb_fts
      WHERE content MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, fetchLimit) as { id: string; rank: number }[];

    const results: KBSearchResult[] = [];
    for (const row of rows) {
      const entry = this.get(row.id);
      if (!entry) continue;
      if (category && entry.category !== category) continue;
      if (origin && entry.origin !== origin) continue;
      // FTS5 rank is negative (lower = better); normalize to 0..1 range
      results.push({ entry, score: 1 / (1 + Math.abs(row.rank)), method: "keyword" });
      if (results.length >= limit) break;
    }
    return results;
  }

  private async hybridSearch(query: string, limit: number, category?: KBCategory, origin?: KBOrigin): Promise<KBSearchResult[]> {
    // Run both searches
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(query, limit, category, origin),
      Promise.resolve(this.keywordSearch(query, limit, category, origin)),
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

    const origins: KBOrigin[] = ["scholastic", "human", "observed", "read", "inferred", "imported"];
    const byOrigin = {} as Record<KBOrigin, number>;
    for (const o of origins) {
      byOrigin[o] = (this.db.prepare(`SELECT COUNT(*) as count FROM kb_entries WHERE origin = ?`).get(o) as { count: number }).count;
    }

    let dbSizeBytes = 0;
    try {
      dbSizeBytes = fs.statSync(this.dbPath).size;
    } catch {
      // DB might be in-memory
    }

    return { total, byCategory, byOrigin, dbSizeBytes };
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

  /** Remove expired temporal entries. */
  pruneExpired(): number {
    const now = new Date().toISOString();
    const expired = this.db.prepare(
      `SELECT id FROM kb_entries WHERE volatility = 'temporal' AND expires_at IS NOT NULL AND expires_at < ?`,
    ).all(now) as { id: string }[];

    for (const row of expired) {
      this.remove(row.id);
    }
    return expired.length;
  }

  close(): void {
    this.db.close();
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Default confidence based on origin — can be overridden per-entry. */
function defaultConfidence(origin: KBOrigin): number {
  switch (origin) {
    case "scholastic": return 1.0;
    case "human":      return 0.9;
    case "observed":   return 0.7;
    case "read":       return 0.6;
    case "inferred":   return 0.5;
    case "imported":   return 0.4;
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
  origin: string;
  confidence: number;
  volatility: string;
  expires_at: string | null;
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
    origin: (row.origin ?? "imported") as KBOrigin,
    confidence: row.confidence ?? 0.5,
    volatility: (row.volatility ?? "stable") as KBVolatility,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
