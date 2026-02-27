/**
 * Dependency graph analyzer.
 *
 * Parses TypeScript imports across the codebase and outputs a visual
 * dependency graph. Shows module clusters, dependency chains, and
 * boundary violations at a glance.
 *
 * Usage:
 *   npx tsx src/devtools/depgraph.ts [--format ascii|mermaid|dot] [--root src/]
 */

import fs from "node:fs";
import path from "node:path";

type Edge = { from: string; to: string };
type Graph = { nodes: Set<string>; edges: Edge[] };

const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Extract import paths from a TypeScript file.
 */
export function extractImports(content: string): string[] {
  const imports: string[] = [];
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const imp = match[1]!;
      // Only track local imports (starting with . or /)
      if (imp.startsWith(".") || imp.startsWith("/")) {
        imports.push(imp);
      }
    }
  }
  return imports;
}

/**
 * Resolve an import path relative to the importing file.
 */
export function resolveImport(fromFile: string, importPath: string, rootDir: string): string | null {
  const dir = path.dirname(fromFile);
  let resolved = path.resolve(dir, importPath);

  // Strip .js extension (TypeScript convention)
  resolved = resolved.replace(/\.js$/, ".ts");

  // Try as-is, then with .ts extension
  if (fs.existsSync(resolved)) return path.relative(rootDir, resolved);
  if (!resolved.endsWith(".ts")) {
    const withTs = resolved + ".ts";
    if (fs.existsSync(withTs)) return path.relative(rootDir, withTs);
  }
  // Try index.ts
  const indexTs = path.join(resolved, "index.ts");
  if (fs.existsSync(indexTs)) return path.relative(rootDir, indexTs);

  return null;
}

/**
 * Build the full dependency graph for a directory of TypeScript files.
 */
export function buildGraph(rootDir: string, globPattern: string = "**/*.ts"): Graph {
  const nodes = new Set<string>();
  const edges: Edge[] = [];

  const files = findTsFiles(rootDir);

  for (const file of files) {
    const relFile = path.relative(rootDir, file);
    // Skip test files and node_modules
    if (relFile.includes(".test.") || relFile.includes("node_modules")) continue;

    nodes.add(relFile);
    const content = fs.readFileSync(file, "utf8");
    const imports = extractImports(content);

    for (const imp of imports) {
      const resolved = resolveImport(file, imp, rootDir);
      if (resolved && !resolved.includes(".test.")) {
        nodes.add(resolved);
        edges.push({ from: relFile, to: resolved });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Detect module clusters (directories) and their inter-cluster dependencies.
 */
export function detectClusters(graph: Graph): Map<string, { files: string[]; internalEdges: number; externalEdges: Edge[] }> {
  const clusters = new Map<string, { files: string[]; internalEdges: number; externalEdges: Edge[] }>();

  for (const node of graph.nodes) {
    const cluster = path.dirname(node) || ".";
    if (!clusters.has(cluster)) {
      clusters.set(cluster, { files: [], internalEdges: 0, externalEdges: [] });
    }
    clusters.get(cluster)!.files.push(path.basename(node));
  }

  for (const edge of graph.edges) {
    const fromCluster = path.dirname(edge.from) || ".";
    const toCluster = path.dirname(edge.to) || ".";
    if (fromCluster === toCluster) {
      clusters.get(fromCluster)!.internalEdges++;
    } else {
      clusters.get(fromCluster)!.externalEdges.push(edge);
    }
  }

  return clusters;
}

/**
 * Compute in-degree (how many files depend on this) and out-degree (how many this depends on).
 */
export function computeDegrees(graph: Graph): Map<string, { inDeg: number; outDeg: number }> {
  const degrees = new Map<string, { inDeg: number; outDeg: number }>();
  for (const node of graph.nodes) {
    degrees.set(node, { inDeg: 0, outDeg: 0 });
  }
  for (const edge of graph.edges) {
    degrees.get(edge.from)!.outDeg++;
    if (degrees.has(edge.to)) {
      degrees.get(edge.to)!.inDeg++;
    }
  }
  return degrees;
}

/**
 * Detect circular dependencies.
 */
export function detectCycles(graph: Graph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node, []);
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  function dfs(node: string): void {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart).concat(node));
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      dfs(neighbor);
    }

    path.pop();
    stack.delete(node);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}

// --- Output Formatters ---

export function formatAscii(graph: Graph): string {
  const clusters = detectClusters(graph);
  const degrees = computeDegrees(graph);
  const cycles = detectCycles(graph);
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║           DEPENDENCY GRAPH                      ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  // Clusters
  for (const [cluster, info] of [...clusters.entries()].sort()) {
    const label = cluster === "." ? "root" : cluster;
    lines.push(`┌─── ${label}/ ${"─".repeat(Math.max(0, 40 - label.length))}┐`);
    for (const file of info.files.sort()) {
      const fullPath = cluster === "." ? file : `${cluster}/${file}`;
      const deg = degrees.get(fullPath);
      const inD = deg?.inDeg ?? 0;
      const outD = deg?.outDeg ?? 0;
      const marker = inD === 0 && outD > 0 ? " ← entry" : inD > 3 ? " ★ hub" : "";
      lines.push(`│  ${file.padEnd(30)} in:${inD} out:${outD}${marker}`);
    }
    if (info.externalEdges.length > 0) {
      lines.push("│");
      const targets = [...new Set(info.externalEdges.map((e) => path.dirname(e.to) || "."))];
      lines.push(`│  → depends on: ${targets.join(", ")}`);
    }
    lines.push(`└${"─".repeat(46)}┘`);
    lines.push("");
  }

  // Cycles
  if (cycles.length > 0) {
    lines.push("⚠  CIRCULAR DEPENDENCIES:");
    for (const cycle of cycles) {
      lines.push(`   ${cycle.join(" → ")}`);
    }
    lines.push("");
  }

  // Summary
  lines.push(`Modules: ${clusters.size}  Files: ${graph.nodes.size}  Dependencies: ${graph.edges.length}  Cycles: ${cycles.length}`);

  return lines.join("\n");
}

export function formatMermaid(graph: Graph): string {
  const lines: string[] = ["graph TD"];
  const clusters = detectClusters(graph);

  for (const [cluster, info] of clusters.entries()) {
    const label = cluster === "." ? "root" : cluster.replace(/\//g, "_");
    lines.push(`  subgraph ${label}`);
    for (const file of info.files) {
      const id = (cluster === "." ? file : `${cluster}/${file}`).replace(/[/.]/g, "_");
      lines.push(`    ${id}["${file}"]`);
    }
    lines.push("  end");
  }

  for (const edge of graph.edges) {
    const fromId = edge.from.replace(/[/.]/g, "_");
    const toId = edge.to.replace(/[/.]/g, "_");
    lines.push(`  ${fromId} --> ${toId}`);
  }

  return lines.join("\n");
}

// --- Helpers ---

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "coverage") {
      results.push(...findTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      results.push(full);
    }
  }
  return results;
}

// --- CLI ---

if (process.argv[1]?.endsWith("depgraph.ts")) {
  const args = process.argv.slice(2);
  const formatIdx = args.indexOf("--format");
  const format = formatIdx !== -1 ? args[formatIdx + 1] ?? "ascii" : "ascii";
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");

  const graph = buildGraph(rootDir);

  if (format === "mermaid") {
    console.log(formatMermaid(graph));
  } else {
    console.log(formatAscii(graph));
  }
}
