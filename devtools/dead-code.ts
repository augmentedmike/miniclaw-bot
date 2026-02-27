/**
 * Dead code detector.
 *
 * Finds exports that nothing imports, potentially unused functions,
 * and orphan files with no importers.
 *
 * Usage:
 *   npx tsx src/devtools/dead-code.ts [--root src/]
 */

import fs from "node:fs";
import path from "node:path";

type DeadExport = { file: string; name: string; line: number };
type OrphanFile = { file: string; exports: string[] };

const EXPORT_RE = /export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+(\w+)/g;
const EXPORT_DEFAULT_RE = /export\s+default\s+(?:function|class)?\s*(\w+)?/g;
const NAMED_EXPORT_RE = /export\s*\{([^}]+)\}/g;

export function findExports(content: string): Array<{ name: string; line: number }> {
  const exports: Array<{ name: string; line: number }> = [];

  for (const re of [EXPORT_RE, EXPORT_DEFAULT_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      const name = match[1];
      if (name) {
        const line = content.slice(0, match.index).split("\n").length;
        exports.push({ name, line });
      }
    }
  }

  NAMED_EXPORT_RE.lastIndex = 0;
  let match;
  while ((match = NAMED_EXPORT_RE.exec(content)) !== null) {
    const names = match[1]!.split(",").map((n) => n.trim().split(/\s+as\s+/).pop()!.trim());
    const line = content.slice(0, match.index).split("\n").length;
    for (const name of names) {
      if (name) exports.push({ name, line });
    }
  }

  return exports;
}

export function findImportedNames(content: string): Set<string> {
  const names = new Set<string>();

  // import { a, b } from ...
  const namedImportRe = /import\s*\{([^}]+)\}\s*from/g;
  let match;
  while ((match = namedImportRe.exec(content)) !== null) {
    const imports = match[1]!.split(",");
    for (const imp of imports) {
      const name = imp.trim().split(/\s+as\s+/)[0]!.trim();
      if (name) names.add(name);
    }
  }

  // import X from ...
  const defaultImportRe = /import\s+(\w+)\s+from/g;
  while ((match = defaultImportRe.exec(content)) !== null) {
    names.add(match[1]!);
  }

  // Also catch usage in code (rough heuristic for re-exports and dynamic usage)
  const identifierRe = /\b([A-Z]\w{2,})\b/g;
  while ((match = identifierRe.exec(content)) !== null) {
    names.add(match[1]!);
  }

  return names;
}

export function detectDeadCode(rootDir: string): { deadExports: DeadExport[]; orphanFiles: OrphanFile[] } {
  const files = findTsFiles(rootDir);
  const fileExports = new Map<string, Array<{ name: string; line: number }>>();
  const allImportedNames = new Set<string>();
  const importedFiles = new Set<string>();

  // Pass 1: collect all exports and imports
  for (const file of files) {
    const rel = path.relative(rootDir, file);
    const content = fs.readFileSync(file, "utf8");
    fileExports.set(rel, findExports(content));

    // Track what names are imported across the codebase
    const imported = findImportedNames(content);
    for (const name of imported) allImportedNames.add(name);

    // Track which files are imported
    const importPathRe = /from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = importPathRe.exec(content)) !== null) {
      const imp = m[1]!;
      if (imp.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), imp).replace(/\.js$/, ".ts");
        const relResolved = path.relative(rootDir, resolved);
        importedFiles.add(relResolved);
        importedFiles.add(relResolved.replace(/\.ts$/, ""));
      }
    }
  }

  // Pass 2: find dead exports
  const deadExports: DeadExport[] = [];
  for (const [file, exports] of fileExports) {
    for (const exp of exports) {
      if (!allImportedNames.has(exp.name)) {
        deadExports.push({ file, name: exp.name, line: exp.line });
      }
    }
  }

  // Pass 3: find orphan files (no one imports them)
  const orphanFiles: OrphanFile[] = [];
  for (const [file, exports] of fileExports) {
    const withoutExt = file.replace(/\.ts$/, "");
    const isImported = importedFiles.has(file) || importedFiles.has(withoutExt);
    const isEntry = file === "index.ts" || file.includes("index.ts");
    const isDevtool = file.startsWith("devtools/");
    if (!isImported && !isEntry && !isDevtool && exports.length > 0) {
      orphanFiles.push({ file, exports: exports.map((e) => e.name) });
    }
  }

  return { deadExports, orphanFiles };
}

export function formatReport(rootDir: string): string {
  const { deadExports, orphanFiles } = detectDeadCode(rootDir);
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║           DEAD CODE REPORT                      ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  if (deadExports.length > 0) {
    lines.push(`⚠  POTENTIALLY UNUSED EXPORTS (${deadExports.length}):`);
    for (const d of deadExports) {
      lines.push(`   ${d.file}:${d.line}  export ${d.name}`);
    }
    lines.push("");
  } else {
    lines.push("✓  No dead exports detected.");
    lines.push("");
  }

  if (orphanFiles.length > 0) {
    lines.push(`⚠  ORPHAN FILES (not imported by anything):`);
    for (const o of orphanFiles) {
      lines.push(`   ${o.file}  (exports: ${o.exports.join(", ")})`);
    }
  } else {
    lines.push("✓  No orphan files.");
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

if (process.argv[1]?.endsWith("dead-code.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  console.log(formatReport(rootDir));
}
