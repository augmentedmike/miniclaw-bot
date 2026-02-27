/**
 * Code duplication detector.
 *
 * Finds similar or identical code blocks across files using
 * line-fingerprinting. Reports duplicated blocks with locations.
 *
 * Usage:
 *   npx tsx src/devtools/duplication.ts [--root src/] [--min-lines 5]
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

type DuplicateBlock = {
  hash: string;
  lines: number;
  locations: Array<{ file: string; startLine: number }>;
  preview: string;
};

/**
 * Normalize a line for comparison: strip whitespace, comments.
 */
function normalizeLine(line: string): string {
  return line
    .replace(/\/\/.*$/, "") // strip line comments
    .replace(/\s+/g, " ")  // collapse whitespace
    .trim();
}

/**
 * Generate fingerprints for sliding windows of N lines.
 */
function fingerprint(lines: string[], windowSize: number): Map<string, Array<{ startLine: number; preview: string }>> {
  const hashes = new Map<string, Array<{ startLine: number; preview: string }>>();

  for (let i = 0; i <= lines.length - windowSize; i++) {
    const window = lines.slice(i, i + windowSize);
    const normalized = window.map(normalizeLine).filter((l) => l.length > 0);

    // Skip windows that are mostly empty or trivial
    if (normalized.length < Math.ceil(windowSize * 0.6)) continue;
    // Skip windows that are just braces/brackets
    if (normalized.every((l) => /^[{}()\[\];,]*$/.test(l))) continue;

    const hash = createHash("md5").update(normalized.join("\n")).digest("hex");
    const preview = window.slice(0, 3).join("\n");

    if (!hashes.has(hash)) hashes.set(hash, []);
    hashes.get(hash)!.push({ startLine: i + 1, preview });
  }

  return hashes;
}

export function detectDuplication(rootDir: string, minLines: number = 5): DuplicateBlock[] {
  const files = findTsFiles(rootDir);
  const globalHashes = new Map<string, Array<{ file: string; startLine: number; preview: string }>>();

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    const rel = path.relative(rootDir, file);

    const hashes = fingerprint(lines, minLines);
    for (const [hash, locations] of hashes) {
      if (!globalHashes.has(hash)) globalHashes.set(hash, []);
      for (const loc of locations) {
        globalHashes.get(hash)!.push({ file: rel, ...loc });
      }
    }
  }

  // Find hashes that appear in multiple files
  const duplicates: DuplicateBlock[] = [];
  for (const [hash, locations] of globalHashes) {
    const uniqueFiles = new Set(locations.map((l) => l.file));
    if (uniqueFiles.size >= 2) {
      // Deduplicate to one location per file
      const deduped = [...uniqueFiles].map((f) => locations.find((l) => l.file === f)!);
      duplicates.push({
        hash,
        lines: minLines,
        locations: deduped.map((l) => ({ file: l.file, startLine: l.startLine })),
        preview: deduped[0]!.preview,
      });
    }
  }

  return duplicates;
}

export function formatReport(rootDir: string, minLines: number = 5): string {
  const duplicates = detectDuplication(rootDir, minLines);
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║           DUPLICATION REPORT                    ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  if (duplicates.length === 0) {
    lines.push(`✓  No duplicated blocks of ${minLines}+ lines found across files.`);
  } else {
    lines.push(`⚠  DUPLICATED BLOCKS (${duplicates.length}):`);
    lines.push("");
    for (const dup of duplicates.slice(0, 20)) {
      lines.push(`  Block (${dup.lines} lines) found in ${dup.locations.length} files:`);
      for (const loc of dup.locations) {
        lines.push(`    ${loc.file}:${loc.startLine}`);
      }
      lines.push(`    Preview: ${dup.preview.split("\n")[0]}`);
      lines.push("");
    }
    if (duplicates.length > 20) {
      lines.push(`  ... and ${duplicates.length - 20} more`);
    }
  }

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

if (process.argv[1]?.endsWith("duplication.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  const minIdx = args.indexOf("--min-lines");
  const minLines = minIdx !== -1 ? parseInt(args[minIdx + 1] ?? "5") : 5;
  console.log(formatReport(rootDir, minLines));
}
