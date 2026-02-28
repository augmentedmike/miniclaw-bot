import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getActivePersonaHome } from "../config.js";

export type SearchResult = {
  file: string;
  line: number;
  snippet: string;
  score?: number;
};

/**
 * Require qmd CLI. Throws if not installed.
 */
function requireQmd(): void {
  try {
    execSync("which qmd", { stdio: "pipe" });
  } catch {
    throw new Error(
      "qmd is not installed. Install it with: npm install -g @tobilu/qmd\n" +
      "See https://github.com/tobi/qmd for details.",
    );
  }
}

/**
 * Ensure the miniclaw-memory collection is registered with qmd.
 * Idempotent — safe to call repeatedly. Throws if qmd not installed.
 */
export function ensureQmdCollection(): void {
  requireQmd();
  const status = execSync("qmd collection list", { encoding: "utf8", stdio: "pipe" });
  if (status.includes("miniclaw-memory")) return;

  const memDir = path.join(getActivePersonaHome(), "memory");
  fs.mkdirSync(memDir, { recursive: true });
  execSync(`qmd collection add "${memDir}" --name miniclaw-memory`, { stdio: "pipe" });
}

/**
 * Re-scan and index memory files with qmd.
 * Runs `qmd update` (re-scans for new/changed files, updates BM25 index)
 * then spawns `qmd embed` detached (vector embeddings update in background).
 */
export function indexMemory(): void {
  requireQmd();
  // Synchronous re-scan so BM25 is immediately up to date
  execSync("qmd update", { stdio: "pipe", timeout: 15_000 });
  // Vector embeddings update lazily in background
  const child = spawn("qmd", ["embed"], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

/**
 * BM25 keyword search via qmd. Fast, no LLM needed.
 */
export function searchMemory(query: string, maxResults: number = 10): SearchResult[] {
  requireQmd();
  const result = execSync(
    `qmd search ${shellEscape(query)} -n ${maxResults} -c miniclaw-memory --json`,
    { encoding: "utf8", stdio: "pipe", timeout: 15_000 },
  );
  return parseQmdJson(result);
}

/**
 * Vector semantic search via qmd. Finds conceptually related content
 * even without keyword overlap.
 */
export function vectorSearchMemory(query: string, maxResults: number = 10): SearchResult[] {
  requireQmd();
  const result = execSync(
    `qmd vsearch ${shellEscape(query)} -n ${maxResults} -c miniclaw-memory --json`,
    { encoding: "utf8", stdio: "pipe", timeout: 30_000 },
  );
  return parseQmdJson(result);
}

/**
 * Hybrid search: BM25 + vector + query expansion + re-ranking.
 * Best quality, slowest. Uses LLM for expansion and re-ranking.
 */
export function deepSearchMemory(query: string, maxResults: number = 10): SearchResult[] {
  requireQmd();
  const result = execSync(
    `qmd query ${shellEscape(query)} -n ${maxResults} -c miniclaw-memory --json`,
    { encoding: "utf8", stdio: "pipe", timeout: 60_000 },
  );
  return parseQmdJson(result);
}

/**
 * Parse qmd --json output into SearchResult[].
 */
function parseQmdJson(raw: string): SearchResult[] {
  const trimmed = raw.trim();
  if (!trimmed || !trimmed.startsWith("[") && !trimmed.startsWith("{")) return [];
  const data = JSON.parse(trimmed);
  const results: SearchResult[] = [];
  const items = Array.isArray(data) ? data : (data.results ?? []);

  for (const item of items) {
    results.push({
      file: item.path ?? item.file ?? item.docid ?? "unknown",
      line: item.line ?? 0,
      snippet: item.snippet ?? item.content ?? item.text ?? "",
      score: item.score ?? undefined,
    });
  }
  return results;
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
