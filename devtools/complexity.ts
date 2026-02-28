/**
 * Lexical & cyclomatic complexity analyzer.
 *
 * Scans TypeScript files and grades each function/method by:
 * - Lines of code
 * - Cyclomatic complexity (branches: if/else/case/&&/||/?:)
 * - Nesting depth
 * - Parameter count
 *
 * Flags functions exceeding thresholds and suggests action.
 *
 * Usage:
 *   npx tsx src/devtools/complexity.ts [--root src/] [--threshold 10]
 */

import fs from "node:fs";
import path from "node:path";

type FunctionMetrics = {
  file: string;
  name: string;
  line: number;
  loc: number;
  complexity: number;
  maxNesting: number;
  params: number;
  grade: "A" | "B" | "C" | "D" | "F";
};

const FUNCTION_RE = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
const ARROW_RE = /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/g;
const METHOD_RE = /(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/g;

// Patterns that increase cyclomatic complexity
const BRANCH_PATTERNS = [
  /\bif\s*\(/g,
  /\belse\s+if\s*\(/g,
  /\bcase\s+/g,
  /\bcatch\s*\(/g,
  /\?\?/g,
  /\?\s*[^:]/g, // ternary (rough heuristic)
  /&&/g,
  /\|\|/g,
  /\bfor\s*\(/g,
  /\bwhile\s*\(/g,
  /\bdo\s*\{/g,
];

export function analyzeComplexity(content: string, filePath: string): FunctionMetrics[] {
  const lines = content.split("\n");
  const results: FunctionMetrics[] = [];

  // Find function boundaries by brace matching
  const functions = findFunctions(content);

  for (const func of functions) {
    const body = content.slice(func.bodyStart, func.bodyEnd);
    const bodyLines = body.split("\n").length;
    let complexity = 1; // Base complexity

    for (const pattern of BRANCH_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(body)) !== null) {
        complexity++;
      }
    }

    const maxNesting = computeMaxNesting(body);
    const params = func.params ? func.params.split(",").filter((p) => p.trim()).length : 0;

    const grade = gradeComplexity(complexity, bodyLines, maxNesting, params);

    results.push({
      file: filePath,
      name: func.name,
      line: content.slice(0, func.start).split("\n").length,
      loc: bodyLines,
      complexity,
      maxNesting,
      params,
      grade,
    });
  }

  return results;
}

function gradeComplexity(complexity: number, loc: number, nesting: number, params: number): "A" | "B" | "C" | "D" | "F" {
  let score = 0;
  if (complexity > 20) score += 4;
  else if (complexity > 10) score += 3;
  else if (complexity > 5) score += 1;

  if (loc > 100) score += 3;
  else if (loc > 50) score += 2;
  else if (loc > 30) score += 1;

  if (nesting > 5) score += 3;
  else if (nesting > 3) score += 1;

  if (params > 5) score += 2;
  else if (params > 3) score += 1;

  if (score >= 8) return "F";
  if (score >= 6) return "D";
  if (score >= 4) return "C";
  if (score >= 2) return "B";
  return "A";
}

type FunctionInfo = { name: string; params: string; start: number; bodyStart: number; bodyEnd: number };

function findFunctions(content: string): FunctionInfo[] {
  const results: FunctionInfo[] = [];

  for (const re of [FUNCTION_RE, ARROW_RE, METHOD_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      const name = match[1]!;
      const params = match[2] ?? "";
      const start = match.index;

      // Find the opening brace
      let bracePos = content.indexOf("{", start + match[0].length - 1);
      // For arrow functions, also check for => without braces
      if (re === ARROW_RE) {
        const arrowPos = content.indexOf("=>", start);
        if (arrowPos !== -1) {
          bracePos = content.indexOf("{", arrowPos);
          if (bracePos === -1 || bracePos > arrowPos + 50) {
            // Single-expression arrow, find to next semicolon or newline
            const endPos = content.indexOf(";", arrowPos);
            if (endPos !== -1) {
              results.push({ name, params, start, bodyStart: arrowPos + 2, bodyEnd: endPos });
              continue;
            }
          }
        }
      }

      if (bracePos === -1) continue;

      // Match braces to find end
      let depth = 1;
      let pos = bracePos + 1;
      while (pos < content.length && depth > 0) {
        if (content[pos] === "{") depth++;
        else if (content[pos] === "}") depth--;
        pos++;
      }

      results.push({ name, params, start, bodyStart: bracePos, bodyEnd: pos });
    }
  }

  // Deduplicate by body position — different regexes can match the same
  // function at different `start` offsets (e.g. METHOD_RE matches at the
  // name while FUNCTION_RE matches at the `function` keyword), but the
  // opening brace (`bodyStart`) is always the same for a given function.
  const seen = new Set<number>();
  return results.filter((f) => {
    if (seen.has(f.bodyStart)) return false;
    seen.add(f.bodyStart);
    return true;
  });
}

function computeMaxNesting(body: string): number {
  let max = 0;
  let current = 0;
  for (const char of body) {
    if (char === "{") { current++; max = Math.max(max, current); }
    else if (char === "}") { current = Math.max(0, current - 1); }
  }
  return max;
}

export function formatReport(metrics: FunctionMetrics[], threshold: number = 10): string {
  const sorted = [...metrics].sort((a, b) => b.complexity - a.complexity);
  const flagged = sorted.filter((m) => m.complexity >= threshold || m.grade === "D" || m.grade === "F");
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║           COMPLEXITY REPORT                     ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  if (flagged.length > 0) {
    lines.push("⚠  FUNCTIONS NEEDING ATTENTION:");
    lines.push("─".repeat(80));
    lines.push("Grade  Cmplx  LOC  Nest  Params  Function");
    lines.push("─".repeat(80));
    for (const m of flagged) {
      const loc = `${m.file}:${m.line}`;
      lines.push(
        `  ${m.grade}     ${String(m.complexity).padStart(3)}   ${String(m.loc).padStart(3)}    ${m.maxNesting}      ${m.params}     ${m.name} (${loc})`,
      );
    }
    lines.push("");
  }

  // Summary by grade
  const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const m of metrics) grades[m.grade]++;

  lines.push("SUMMARY:");
  lines.push(`  Total functions: ${metrics.length}`);
  lines.push(`  A (simple):     ${grades.A}`);
  lines.push(`  B (moderate):   ${grades.B}`);
  lines.push(`  C (complex):    ${grades.C}`);
  lines.push(`  D (very complex): ${grades.D}`);
  lines.push(`  F (needs refactor): ${grades.F}`);
  lines.push(`  Avg complexity: ${(metrics.reduce((s, m) => s + m.complexity, 0) / Math.max(1, metrics.length)).toFixed(1)}`);

  return lines.join("\n");
}

// --- CLI ---
if (process.argv[1]?.endsWith("complexity.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  const threshIdx = args.indexOf("--threshold");
  const threshold = threshIdx !== -1 ? parseInt(args[threshIdx + 1] ?? "10") : 10;

  const allMetrics: FunctionMetrics[] = [];
  const files = findTsFiles(rootDir);

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(rootDir, file);
    allMetrics.push(...analyzeComplexity(content, rel));
  }

  console.log(formatReport(allMetrics, threshold));
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
