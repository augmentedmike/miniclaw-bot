/**
 * Readability scorer.
 *
 * Grades each file on readability metrics:
 * - Average line length (shorter = better)
 * - Identifier naming consistency (camelCase vs snake_case mixing)
 * - Comment density (% of lines that are comments)
 * - Magic number usage
 * - Deep nesting
 * - Long parameter lists
 *
 * Usage:
 *   npx tsx devtools/readability.ts [--root src/]
 */

import fs from "node:fs";
import path from "node:path";

export type ReadabilityMetrics = {
  file: string;
  lines: number;
  avgLineLength: number;
  maxLineLength: number;
  commentDensity: number; // 0-1
  namingConsistency: number; // 0-1 (1 = all same convention)
  magicNumbers: number;
  maxNesting: number;
  longParamFunctions: number;
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
};

const COMMENT_LINE_RE = /^\s*\/\//;
const BLOCK_COMMENT_START = /\/\*/;
const BLOCK_COMMENT_END = /\*\//;
const CAMEL_CASE_RE = /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g;
const SNAKE_CASE_RE = /\b[a-z][a-z0-9]*_[a-z][a-z0-9_]*\b/g;
const MAGIC_NUMBER_RE = /(?<![.\w])\b(?!0\b|1\b|2\b|-1\b)\d{2,}\b(?!\s*[;:}\])]?\s*\/\/)/g;
const PARAM_LIST_RE = /\(([^)]{80,})\)/g;

export function analyzeReadability(content: string, fileName: string): ReadabilityMetrics {
  const lines = content.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);

  // Average and max line length
  const lengths = nonEmptyLines.map((l) => l.length);
  const avgLineLength = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const maxLineLength = lengths.length > 0 ? Math.max(...lengths) : 0;

  // Comment density
  let commentLines = 0;
  let inBlockComment = false;
  for (const line of lines) {
    if (inBlockComment) {
      commentLines++;
      if (BLOCK_COMMENT_END.test(line)) inBlockComment = false;
    } else if (COMMENT_LINE_RE.test(line)) {
      commentLines++;
    } else if (BLOCK_COMMENT_START.test(line)) {
      commentLines++;
      if (!BLOCK_COMMENT_END.test(line)) inBlockComment = false;
      inBlockComment = !BLOCK_COMMENT_END.test(line);
    }
  }
  const commentDensity = lines.length > 0 ? commentLines / lines.length : 0;

  // Naming consistency
  CAMEL_CASE_RE.lastIndex = 0;
  SNAKE_CASE_RE.lastIndex = 0;
  const camelCount = (content.match(CAMEL_CASE_RE) ?? []).length;
  const snakeCount = (content.match(SNAKE_CASE_RE) ?? []).length;
  const totalNaming = camelCount + snakeCount;
  const namingConsistency = totalNaming > 0 ? Math.max(camelCount, snakeCount) / totalNaming : 1;

  // Magic numbers (outside common 0, 1, 2, -1)
  const codeOnly = lines
    .filter((l) => !COMMENT_LINE_RE.test(l))
    .join("\n");
  const magicNumbers = (codeOnly.match(MAGIC_NUMBER_RE) ?? []).length;

  // Max nesting depth
  let maxNesting = 0;
  let currentNesting = 0;
  for (const char of content) {
    if (char === "{") {
      currentNesting++;
      maxNesting = Math.max(maxNesting, currentNesting);
    } else if (char === "}") {
      currentNesting = Math.max(0, currentNesting - 1);
    }
  }

  // Functions with long parameter lists
  PARAM_LIST_RE.lastIndex = 0;
  const longParamFunctions = (content.match(PARAM_LIST_RE) ?? []).length;

  // Score calculation (0-100, higher = more readable)
  let score = 100;

  // Penalize long lines
  if (avgLineLength > 100) score -= 15;
  else if (avgLineLength > 80) score -= 8;
  else if (avgLineLength > 60) score -= 3;

  // Reward good doc comments (module-level, function-level JSDoc)
  // Penalize inline noise comments
  const docCommentCount = (content.match(/\/\*\*[\s\S]*?\*\//g) ?? []).length;
  const inlineNoiseCount = (content.match(/\/\/\s*(?:TODO|FIXME|HACK|XXX|changed|removed|old|was|fix)\b/gi) ?? []).length;
  score += Math.min(10, docCommentCount * 3); // reward doc comments
  score -= Math.min(10, inlineNoiseCount * 2); // penalize noise comments

  // Penalize naming inconsistency
  score -= Math.round((1 - namingConsistency) * 15);

  // Penalize magic numbers
  score -= Math.min(20, magicNumbers * 3);

  // Penalize deep nesting
  if (maxNesting > 6) score -= 15;
  else if (maxNesting > 4) score -= 8;
  else if (maxNesting > 3) score -= 3;

  // Penalize long param lists
  score -= Math.min(10, longParamFunctions * 3);

  // Penalize very long files
  if (lines.length > 300) score -= 10;
  else if (lines.length > 200) score -= 5;

  score = Math.max(0, Math.min(100, score));

  const grade: ReadabilityMetrics["grade"] =
    score >= 85 ? "A" :
    score >= 70 ? "B" :
    score >= 55 ? "C" :
    score >= 40 ? "D" : "F";

  return {
    file: fileName,
    lines: lines.length,
    avgLineLength: Math.round(avgLineLength),
    maxLineLength,
    commentDensity: Math.round(commentDensity * 100) / 100,
    namingConsistency: Math.round(namingConsistency * 100) / 100,
    magicNumbers,
    maxNesting,
    longParamFunctions,
    score,
    grade,
  };
}

export function formatReport(rootDir: string): string {
  const files = findTsFiles(rootDir);
  const metrics: ReadabilityMetrics[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(rootDir, file);
    metrics.push(analyzeReadability(content, rel));
  }

  const sorted = [...metrics].sort((a, b) => a.score - b.score);
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║           READABILITY REPORT                    ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  // Worst files first
  lines.push("FILE SCORES (worst first):");
  lines.push("─".repeat(80));
  lines.push("Grade  Score  AvgLn  MaxLn  Cmts  Magic  Nest  File");
  lines.push("─".repeat(80));
  for (const m of sorted) {
    lines.push(
      `  ${m.grade}     ${String(m.score).padStart(3)}   ${String(m.avgLineLength).padStart(4)}   ${String(m.maxLineLength).padStart(4)}   ${(m.commentDensity * 100).toFixed(0).padStart(3)}%   ${String(m.magicNumbers).padStart(3)}    ${m.maxNesting}    ${m.file}`,
    );
  }
  lines.push("");

  // Summary
  const avgScore = metrics.length > 0 ? Math.round(metrics.reduce((s, m) => s + m.score, 0) / metrics.length) : 0;
  const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const m of metrics) grades[m.grade]++;

  lines.push(`Average readability score: ${avgScore}/100`);
  lines.push(`Grades: A:${grades.A} B:${grades.B} C:${grades.C} D:${grades.D} F:${grades.F}`);

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

if (process.argv[1]?.endsWith("readability.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  console.log(formatReport(rootDir));
}
