/**
 * Consolidated quality report generator.
 *
 * Runs all devtools and writes structured reports to reports/.
 * Called by the pre-commit hook to capture quality snapshots.
 *
 * Usage:
 *   npx tsx devtools/report.ts [--root src/] [--out reports/]
 */

import fs from "node:fs";
import path from "node:path";
import { buildGraph, formatAscii as depgraphAscii, formatMermaid as depgraphMermaid } from "./depgraph.js";
import { formatReport as complexityReport, analyzeComplexity } from "./complexity.js";
import { formatReport as solidReport } from "./solid-check.js";
import { formatReport as duplicationReport } from "./duplication.js";
import { formatReport as deadCodeReport } from "./dead-code.js";
import { formatReport as apiSurfaceReport } from "./api-surface.js";
import { formatAscii as stateMachineAscii, formatMermaid as stateMachineMermaid, scanDirectory } from "./state-machine.js";
import { formatReport as sideEffectsReport } from "./side-effects.js";
import { formatReport as couplingReport } from "./coupling.js";
import { formatReport as readabilityReport } from "./readability.js";
import { formatReport as cohesionReport } from "./cohesion.js";
import { extractFeatures, formatText as featuresText, formatMarkdown as featuresMd } from "./features.js";

export type QualitySummary = {
  timestamp: string;
  depgraph: string;
  depgraphMermaid: string;
  complexity: string;
  solid: string;
  duplication: string;
  deadCode: string;
  apiSurface: string;
  stateMachine: string;
  stateMachineMermaid: string;
  sideEffects: string;
  coupling: string;
  readability: string;
  cohesion: string;
  features: string;
  featuresMd: string;
};

export function generateReports(rootDir: string): QualitySummary {
  const graph = buildGraph(rootDir);
  const machines = scanDirectory(rootDir);
  return {
    timestamp: new Date().toISOString(),
    depgraph: depgraphAscii(graph),
    depgraphMermaid: depgraphMermaid(graph),
    complexity: complexityReportForDir(rootDir),
    solid: solidReport(rootDir),
    duplication: duplicationReport(rootDir),
    deadCode: deadCodeReport(rootDir),
    apiSurface: apiSurfaceReport(rootDir),
    stateMachine: stateMachineAscii(machines),
    stateMachineMermaid: stateMachineMermaid(machines),
    sideEffects: sideEffectsReport(rootDir),
    coupling: couplingReport(rootDir),
    readability: readabilityReport(rootDir),
    cohesion: cohesionReport(rootDir),
    features: featuresText(extractFeatures(rootDir)),
    featuresMd: featuresMd(extractFeatures(rootDir)),
  };
}

function complexityReportForDir(rootDir: string): string {
  const files = findTsFiles(rootDir);
  const allMetrics = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(rootDir, file);
    allMetrics.push(...analyzeComplexity(content, rel));
  }
  return complexityReport(allMetrics);
}

export function writeReports(reports: QualitySummary, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });

  // Individual text reports
  fs.writeFileSync(path.join(outDir, "depgraph.txt"), reports.depgraph);
  fs.writeFileSync(path.join(outDir, "complexity.txt"), reports.complexity);
  fs.writeFileSync(path.join(outDir, "solid.txt"), reports.solid);
  fs.writeFileSync(path.join(outDir, "duplication.txt"), reports.duplication);
  fs.writeFileSync(path.join(outDir, "dead-code.txt"), reports.deadCode);
  fs.writeFileSync(path.join(outDir, "api-surface.txt"), reports.apiSurface);
  fs.writeFileSync(path.join(outDir, "state-machine.txt"), reports.stateMachine);
  fs.writeFileSync(path.join(outDir, "side-effects.txt"), reports.sideEffects);
  fs.writeFileSync(path.join(outDir, "coupling.txt"), reports.coupling);
  fs.writeFileSync(path.join(outDir, "readability.txt"), reports.readability);
  fs.writeFileSync(path.join(outDir, "cohesion.txt"), reports.cohesion);
  fs.writeFileSync(path.join(outDir, "features.txt"), reports.features);
  fs.writeFileSync(path.join(outDir, "FEATURES.md"), reports.featuresMd);

  // Mermaid diagrams (renderable on GitHub, IDEs, etc.)
  fs.writeFileSync(path.join(outDir, "depgraph.mermaid"), reports.depgraphMermaid);
  fs.writeFileSync(path.join(outDir, "state-machine.mermaid"), reports.stateMachineMermaid);

  // Combined summary
  const combined = [
    `Quality Report — ${reports.timestamp}`,
    "=".repeat(50),
    "",
    reports.depgraph, "",
    reports.complexity, "",
    reports.solid, "",
    reports.coupling, "",
    reports.readability, "",
    reports.cohesion, "",
    reports.sideEffects, "",
    reports.stateMachine, "",
    reports.duplication, "",
    reports.deadCode, "",
    reports.apiSurface, "",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "SUMMARY.txt"), combined);
}

/**
 * Extract key metrics for the commit message quality block.
 */
export function extractMetricsLine(reports: QualitySummary): string {
  const solidMatch = reports.solid.match(/Total: (\d+) errors, (\d+) warnings/);
  const solidClean = reports.solid.includes("No SOLID violations");
  const solidStr = solidClean ? "SOLID: clean" : solidMatch ? `SOLID: ${solidMatch[1]}err ${solidMatch[2]}warn` : "SOLID: n/a";

  const readMatch = reports.readability.match(/Average readability score: (\d+)\/100/);
  const readStr = readMatch ? `Read: ${readMatch[1]}/100` : "Read: n/a";

  const cohMatch = reports.cohesion.match(/Average cohesion: (\d+)\/100/);
  const cohStr = cohMatch ? `Cohesion: ${cohMatch[1]}/100` : "Cohesion: n/a";

  const couplingMatch = reports.coupling.match(/(\d+) bidirectional pairs/);
  const coupStr = couplingMatch ? `Bidir: ${couplingMatch[1]}` : "Bidir: 0";

  const dupMatch = reports.duplication.match(/DUPLICATED BLOCKS \((\d+)\)/);
  const dupClean = reports.duplication.includes("No duplicated blocks");
  const dupStr = dupClean ? "Dup: 0" : dupMatch ? `Dup: ${dupMatch[1]}` : "Dup: n/a";

  return `${solidStr} | ${readStr} | ${cohStr} | ${coupStr} | ${dupStr}`;
}

/**
 * Format the full quality block for a commit message.
 *
 * Returns the structured block that gets appended after the
 * user's summary line, including test results and report links.
 */
export function formatCommitBlock(reports: QualitySummary, testOutput: string): string {
  const metrics = extractMetricsLine(reports);

  // Parse test output for summary line
  const testSummary = parseTestSummary(testOutput);

  const lines = [
    "",
    "--- Test Results ---",
    testSummary,
    "",
    "--- Quality Metrics ---",
    metrics,
    "",
    "--- Reports ---",
    "reports/SUMMARY.txt",
    "reports/depgraph.mermaid",
    "reports/state-machine.mermaid",
  ];
  return lines.join("\n");
}

/**
 * Parse vitest output into a concise summary line.
 */
export function parseTestSummary(output: string): string {
  const lines: string[] = [];

  // Match "Tests  X passed (Y)" or "Tests  X failed | Y passed (Z)"
  const testsMatch = output.match(/Tests\s+(.+)/);
  if (testsMatch) lines.push(`Tests:  ${testsMatch[1].trim()}`);

  // Match "Test Files  X passed (Y)"
  const filesMatch = output.match(/Test Files\s+(.+)/);
  if (filesMatch) lines.push(`Files:  ${filesMatch[1].trim()}`);

  // Match "Duration  X.XXs"
  const durationMatch = output.match(/Duration\s+([\d.]+s)/);
  if (durationMatch) lines.push(`Time:   ${durationMatch[1]}`);

  return lines.length > 0 ? lines.join("\n") : output.trim().split("\n").slice(-5).join("\n");
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

// --- CLI ---
if (process.argv[1]?.endsWith("report.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  const outIdx = args.indexOf("--out");
  const outDir = path.resolve(outIdx !== -1 ? args[outIdx + 1] ?? "reports" : "reports");

  console.log("Generating quality reports...");
  const reports = generateReports(rootDir);
  writeReports(reports, outDir);
  console.log(`Reports written to ${outDir}/`);
  console.log(extractMetricsLine(reports));
}
