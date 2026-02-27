/**
 * SOLID principle checker.
 *
 * Detects violations of SOLID principles at the file/module level:
 *
 * - S (SRP): Files with too many exports or mixed concerns
 * - O (OCP): Files with many conditionals that should use polymorphism
 * - L (LSP): Not applicable at static analysis level
 * - I (ISP): Files importing many things they don't use
 * - D (DIP): High-level modules importing low-level implementation details
 *
 * Usage:
 *   npx tsx src/devtools/solid-check.ts [--root src/]
 */

import fs from "node:fs";
import path from "node:path";

type Violation = {
  principle: "SRP" | "OCP" | "ISP" | "DIP";
  file: string;
  message: string;
  severity: "warn" | "error";
};

export function checkSolid(rootDir: string): Violation[] {
  const violations: Violation[] = [];
  const files = findTsFiles(rootDir);

  for (const file of files) {
    const rel = path.relative(rootDir, file);
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");

    // SRP: Too many exports suggests mixed responsibilities
    const exportCount = (content.match(/\bexport\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\b/g) ?? []).length;
    if (exportCount > 10) {
      violations.push({
        principle: "SRP",
        file: rel,
        message: `${exportCount} exports — consider splitting into focused modules`,
        severity: "error",
      });
    } else if (exportCount > 6) {
      violations.push({
        principle: "SRP",
        file: rel,
        message: `${exportCount} exports — approaching too many responsibilities`,
        severity: "warn",
      });
    }

    // SRP: File too long
    if (lines.length > 300) {
      violations.push({
        principle: "SRP",
        file: rel,
        message: `${lines.length} lines — file is very long, consider extracting`,
        severity: lines.length > 500 ? "error" : "warn",
      });
    }

    // OCP: Too many switch/case or long if-else chains
    const switchCount = (content.match(/\bswitch\s*\(/g) ?? []).length;
    const longIfElse = (content.match(/else\s+if/g) ?? []).length;
    if (switchCount + longIfElse > 5) {
      violations.push({
        principle: "OCP",
        file: rel,
        message: `${switchCount} switches + ${longIfElse} else-if chains — consider strategy/map pattern`,
        severity: "warn",
      });
    }

    // ISP: Importing many names suggests depending on a fat interface
    const importNames = content.match(/import\s*\{([^}]+)\}/g) ?? [];
    for (const imp of importNames) {
      const names = imp.match(/\{([^}]+)\}/)?.[1]?.split(",") ?? [];
      if (names.length > 8) {
        violations.push({
          principle: "ISP",
          file: rel,
          message: `Importing ${names.length} names from one module — interface may be too broad`,
          severity: "warn",
        });
      }
    }

    // DIP: Direct fs/child_process imports in non-tool/non-infra files
    const dir = path.dirname(rel);
    const isInfra = dir.includes("tools") || dir.includes("memory") || dir.includes("devtools") || rel === "auth.ts" || rel === "config.ts";
    if (!isInfra) {
      const hasDirectFs = /import.*from\s+['"]node:fs['"]/g.test(content);
      const hasDirectCp = /import.*from\s+['"]node:child_process['"]/g.test(content);
      if (hasDirectFs || hasDirectCp) {
        violations.push({
          principle: "DIP",
          file: rel,
          message: `Direct ${hasDirectFs ? "fs" : "child_process"} import — consider injecting via dependency`,
          severity: "warn",
        });
      }
    }
  }

  return violations;
}

export function formatReport(rootDir: string): string {
  const violations = checkSolid(rootDir);
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║           SOLID CHECK REPORT                    ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  const byPrinciple = new Map<string, Violation[]>();
  for (const v of violations) {
    if (!byPrinciple.has(v.principle)) byPrinciple.set(v.principle, []);
    byPrinciple.get(v.principle)!.push(v);
  }

  const principleNames: Record<string, string> = {
    SRP: "Single Responsibility",
    OCP: "Open/Closed",
    ISP: "Interface Segregation",
    DIP: "Dependency Inversion",
  };

  for (const [principle, items] of byPrinciple) {
    const errors = items.filter((v) => v.severity === "error");
    const warns = items.filter((v) => v.severity === "warn");
    lines.push(`${principle} (${principleNames[principle]}):`);
    for (const v of errors) {
      lines.push(`  ✗ ${v.file}: ${v.message}`);
    }
    for (const v of warns) {
      lines.push(`  △ ${v.file}: ${v.message}`);
    }
    lines.push("");
  }

  if (violations.length === 0) {
    lines.push("✓  No SOLID violations detected.");
  } else {
    const errors = violations.filter((v) => v.severity === "error").length;
    const warns = violations.filter((v) => v.severity === "warn").length;
    lines.push(`Total: ${errors} errors, ${warns} warnings`);
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

if (process.argv[1]?.endsWith("solid-check.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  console.log(formatReport(rootDir));
}
