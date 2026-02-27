/**
 * Coupling matrix generator.
 *
 * Produces an NxN matrix showing how strongly each module pair
 * is coupled. Coupling score = number of imports between them.
 * Highlights tight coupling that the dep graph might not surface.
 *
 * Usage:
 *   npx tsx devtools/coupling.ts [--root src/]
 */

import fs from "node:fs";
import path from "node:path";

export type CouplingPair = {
  moduleA: string;
  moduleB: string;
  aToB: number;  // imports from A → B
  bToA: number;  // imports from B → A
  score: number; // total coupling strength
};

export type CouplingMatrix = {
  modules: string[];
  matrix: number[][]; // matrix[i][j] = imports from module i to module j
  pairs: CouplingPair[];
};

const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function resolveModule(fromFile: string, importPath: string, rootDir: string): string | null {
  if (!importPath.startsWith(".")) return null;
  const dir = path.dirname(fromFile);
  let resolved = path.resolve(dir, importPath).replace(/\.js$/, ".ts");
  const rel = path.relative(rootDir, resolved);
  // Return the directory (module cluster)
  return path.dirname(rel) || ".";
}

export function buildCouplingMatrix(rootDir: string): CouplingMatrix {
  const files = findTsFiles(rootDir);
  const moduleSet = new Set<string>();
  const edges: Array<{ fromMod: string; toMod: string }> = [];

  for (const file of files) {
    const rel = path.relative(rootDir, file);
    if (rel.includes(".test.")) continue;

    const fromMod = path.dirname(rel) || ".";
    moduleSet.add(fromMod);

    const content = fs.readFileSync(file, "utf8");
    IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_RE.exec(content)) !== null) {
      const toMod = resolveModule(file, m[1]!, rootDir);
      if (toMod && toMod !== fromMod) {
        moduleSet.add(toMod);
        edges.push({ fromMod, toMod });
      }
    }
  }

  const modules = [...moduleSet].sort();
  const indexMap = new Map<string, number>();
  modules.forEach((m, i) => indexMap.set(m, i));

  const matrix: number[][] = modules.map(() => modules.map(() => 0));

  for (const { fromMod, toMod } of edges) {
    const i = indexMap.get(fromMod)!;
    const j = indexMap.get(toMod)!;
    matrix[i]![j]!++;
  }

  // Build pairs
  const pairs: CouplingPair[] = [];
  for (let i = 0; i < modules.length; i++) {
    for (let j = i + 1; j < modules.length; j++) {
      const aToB = matrix[i]![j]!;
      const bToA = matrix[j]![i]!;
      if (aToB > 0 || bToA > 0) {
        pairs.push({
          moduleA: modules[i]!,
          moduleB: modules[j]!,
          aToB,
          bToA,
          score: aToB + bToA,
        });
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score);

  return { modules, matrix, pairs };
}

export function formatReport(rootDir: string): string {
  const { modules, matrix, pairs } = buildCouplingMatrix(rootDir);
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║           COUPLING MATRIX                       ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  if (modules.length === 0) {
    lines.push("No modules found.");
    return lines.join("\n");
  }

  // Short labels
  const labels = modules.map((m) => m === "." ? "root" : m.replace(/\//g, "/"));
  const maxLabel = Math.max(...labels.map((l) => l.length));

  // Header row
  const header = " ".repeat(maxLabel + 2) + labels.map((l) => l.slice(0, 6).padStart(7)).join("");
  lines.push(header);
  lines.push("─".repeat(header.length));

  // Matrix rows
  for (let i = 0; i < modules.length; i++) {
    const row = labels[i]!.padEnd(maxLabel + 2) +
      matrix[i]!.map((v) => {
        if (v === 0) return "      ·";
        return String(v).padStart(7);
      }).join("");
    lines.push(row);
  }

  lines.push("");

  // Top coupling pairs
  if (pairs.length > 0) {
    lines.push("STRONGEST COUPLING:");
    for (const p of pairs.slice(0, 10)) {
      const bidir = p.aToB > 0 && p.bToA > 0 ? " ⚠ BIDIRECTIONAL" : "";
      const aLabel = p.moduleA === "." ? "root" : p.moduleA;
      const bLabel = p.moduleB === "." ? "root" : p.moduleB;
      lines.push(`  ${aLabel} ↔ ${bLabel}  score:${p.score} (${aLabel}→${bLabel}:${p.aToB}, ${bLabel}→${aLabel}:${p.bToA})${bidir}`);
    }
    lines.push("");
  }

  const totalCoupling = pairs.reduce((s, p) => s + p.score, 0);
  const bidirectional = pairs.filter((p) => p.aToB > 0 && p.bToA > 0).length;
  lines.push(`Total: ${modules.length} modules, ${totalCoupling} import edges, ${bidirectional} bidirectional pairs`);

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

if (process.argv[1]?.endsWith("coupling.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  console.log(formatReport(rootDir));
}
