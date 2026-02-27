/**
 * Module cohesion analyzer.
 *
 * Measures how related the exports within a single file are.
 * Low cohesion = the file is doing too many unrelated things.
 *
 * Metrics:
 * - Shared identifier overlap between functions (do they use the same vars?)
 * - Export name semantic clustering (do names share prefixes/domains?)
 * - Internal call graph connectivity (do functions call each other?)
 *
 * Usage:
 *   npx tsx devtools/cohesion.ts [--root src/]
 */

import fs from "node:fs";
import path from "node:path";

export type CohesionMetrics = {
  file: string;
  exportCount: number;
  internalCalls: number;   // how many exports call other exports in same file
  sharedIdentifiers: number; // avg shared identifiers between function pairs
  namePrefixGroups: number;  // how many distinct name prefix groups
  cohesionScore: number;     // 0-100 (100 = perfectly cohesive)
  grade: "high" | "medium" | "low";
};

const EXPORT_FUNC_RE = /export\s+(?:async\s+)?function\s+(\w+)/g;
const EXPORT_CONST_RE = /export\s+const\s+(\w+)/g;
const IDENTIFIER_RE = /\b([a-zA-Z_]\w{2,})\b/g;

/**
 * Extract function bodies for each export.
 */
function extractExportBodies(content: string): Map<string, string> {
  const bodies = new Map<string, string>();

  EXPORT_FUNC_RE.lastIndex = 0;
  let m;
  while ((m = EXPORT_FUNC_RE.exec(content)) !== null) {
    const name = m[1]!;
    const braceStart = content.indexOf("{", m.index + m[0].length);
    if (braceStart === -1) continue;

    let depth = 1;
    let pos = braceStart + 1;
    while (pos < content.length && depth > 0) {
      if (content[pos] === "{") depth++;
      else if (content[pos] === "}") depth--;
      pos++;
    }
    bodies.set(name, content.slice(braceStart, pos));
  }

  return bodies;
}

/**
 * Extract identifiers used in a block of code.
 */
function extractIdentifiers(code: string): Set<string> {
  const ids = new Set<string>();
  IDENTIFIER_RE.lastIndex = 0;
  let m;
  while ((m = IDENTIFIER_RE.exec(code)) !== null) {
    // Skip common keywords
    const word = m[1]!;
    if (!KEYWORDS.has(word)) {
      ids.add(word);
    }
  }
  return ids;
}

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "export", "import", "from",
  "async", "await", "for", "while", "if", "else", "switch", "case",
  "break", "continue", "try", "catch", "throw", "new", "this",
  "true", "false", "null", "undefined", "typeof", "instanceof",
  "string", "number", "boolean", "void", "any", "unknown", "never",
  "Promise", "Array", "Map", "Set", "Error", "Object", "String", "Number",
]);

/**
 * Find common prefix groups among names.
 * e.g., ["readFile", "readDir", "writeFile"] → { "read": 2, "write": 1 }
 */
function findPrefixGroups(names: string[]): number {
  if (names.length <= 1) return names.length;

  const prefixes = new Set<string>();
  for (const name of names) {
    // Extract prefix: camelCase first word
    const prefix = name.match(/^[a-z]+/)?.[0] ?? name.slice(0, 4);
    prefixes.add(prefix);
  }
  return prefixes.size;
}

export function analyzeCohesion(content: string, fileName: string): CohesionMetrics | null {
  // Collect all export names
  const exportNames: string[] = [];
  for (const re of [EXPORT_FUNC_RE, EXPORT_CONST_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      exportNames.push(m[1]!);
    }
  }

  if (exportNames.length < 2) return null;

  const bodies = extractExportBodies(content);

  // Metric 1: Internal calls (do exports reference each other?)
  let internalCalls = 0;
  for (const [name, body] of bodies) {
    for (const otherName of exportNames) {
      if (otherName !== name && body.includes(otherName)) {
        internalCalls++;
      }
    }
  }

  // Metric 2: Shared identifiers between function pairs
  const identifierSets = new Map<string, Set<string>>();
  for (const [name, body] of bodies) {
    identifierSets.set(name, extractIdentifiers(body));
  }

  let totalShared = 0;
  let pairCount = 0;
  const funcNames = [...identifierSets.keys()];
  for (let i = 0; i < funcNames.length; i++) {
    for (let j = i + 1; j < funcNames.length; j++) {
      const setA = identifierSets.get(funcNames[i]!)!;
      const setB = identifierSets.get(funcNames[j]!)!;
      let shared = 0;
      for (const id of setA) {
        if (setB.has(id)) shared++;
      }
      totalShared += shared;
      pairCount++;
    }
  }
  const avgShared = pairCount > 0 ? totalShared / pairCount : 0;

  // Metric 3: Name prefix groups
  const prefixGroups = findPrefixGroups(exportNames);

  // Score: 0-100
  let score = 50; // baseline

  // Internal calls boost cohesion
  const callRatio = exportNames.length > 1 ? internalCalls / (exportNames.length - 1) : 0;
  score += Math.min(25, Math.round(callRatio * 25));

  // Shared identifiers boost cohesion
  score += Math.min(15, Math.round(avgShared * 1.5));

  // Fewer prefix groups = more cohesive naming
  const prefixRatio = exportNames.length > 0 ? prefixGroups / exportNames.length : 1;
  score += Math.round((1 - prefixRatio) * 10);

  score = Math.max(0, Math.min(100, score));

  const grade: CohesionMetrics["grade"] =
    score >= 65 ? "high" :
    score >= 40 ? "medium" : "low";

  return {
    file: fileName,
    exportCount: exportNames.length,
    internalCalls,
    sharedIdentifiers: Math.round(avgShared),
    namePrefixGroups: prefixGroups,
    cohesionScore: score,
    grade,
  };
}

export function formatReport(rootDir: string): string {
  const files = findTsFiles(rootDir);
  const metrics: CohesionMetrics[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(rootDir, file);
    const result = analyzeCohesion(content, rel);
    if (result) metrics.push(result);
  }

  const sorted = [...metrics].sort((a, b) => a.cohesionScore - b.cohesionScore);
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║           MODULE COHESION REPORT                ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  if (sorted.length === 0) {
    lines.push("No multi-export modules to analyze.");
    return lines.join("\n");
  }

  lines.push("Cohesion  Exports  IntCalls  SharedIDs  Prefixes  File");
  lines.push("─".repeat(75));

  for (const m of sorted) {
    const icon = m.grade === "low" ? "✗" : m.grade === "medium" ? "△" : "✓";
    lines.push(
      `  ${icon} ${String(m.cohesionScore).padStart(3)}    ${String(m.exportCount).padStart(3)}       ${String(m.internalCalls).padStart(3)}        ${String(m.sharedIdentifiers).padStart(3)}        ${String(m.namePrefixGroups).padStart(2)}     ${m.file}`,
    );
  }
  lines.push("");

  const low = sorted.filter((m) => m.grade === "low");
  if (low.length > 0) {
    lines.push("⚠  LOW COHESION (consider splitting):");
    for (const m of low) {
      lines.push(`   ${m.file}: ${m.exportCount} exports with ${m.namePrefixGroups} distinct concerns`);
    }
    lines.push("");
  }

  const avg = metrics.length > 0 ? Math.round(metrics.reduce((s, m) => s + m.cohesionScore, 0) / metrics.length) : 0;
  lines.push(`Average cohesion: ${avg}/100`);

  return lines.join("\n");
}

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !["node_modules", "dist", "coverage"].includes(entry.name)) {
      results.push(...findTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      results.push(full);
    }
  }
  return results;
}

if (process.argv[1]?.endsWith("cohesion.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  console.log(formatReport(rootDir));
}
