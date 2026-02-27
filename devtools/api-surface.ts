/**
 * API surface mapper.
 *
 * Maps every public export and who consumes it. Shows the "contract"
 * of each module — useful for understanding impact of refactoring.
 *
 * Usage:
 *   npx tsx src/devtools/api-surface.ts [--root src/]
 */

import fs from "node:fs";
import path from "node:path";

type ExportInfo = {
  name: string;
  kind: "function" | "const" | "class" | "type" | "interface" | "enum" | "other";
  line: number;
};

type ModuleSurface = {
  file: string;
  exports: ExportInfo[];
  consumers: Map<string, string[]>; // file → imported names
};

const EXPORT_KINDS = [
  { re: /export\s+(?:async\s+)?function\s+(\w+)/g, kind: "function" as const },
  { re: /export\s+const\s+(\w+)/g, kind: "const" as const },
  { re: /export\s+let\s+(\w+)/g, kind: "const" as const },
  { re: /export\s+class\s+(\w+)/g, kind: "class" as const },
  { re: /export\s+type\s+(\w+)/g, kind: "type" as const },
  { re: /export\s+interface\s+(\w+)/g, kind: "interface" as const },
  { re: /export\s+enum\s+(\w+)/g, kind: "enum" as const },
];

export function mapApiSurface(rootDir: string): ModuleSurface[] {
  const files = findTsFiles(rootDir);
  const modules: ModuleSurface[] = [];
  const fileContents = new Map<string, string>();

  // Pass 1: collect exports
  for (const file of files) {
    const rel = path.relative(rootDir, file);
    const content = fs.readFileSync(file, "utf8");
    fileContents.set(rel, content);

    const exports: ExportInfo[] = [];
    for (const { re, kind } of EXPORT_KINDS) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(content)) !== null) {
        const line = content.slice(0, match.index).split("\n").length;
        exports.push({ name: match[1]!, kind, line });
      }
    }

    if (exports.length > 0) {
      modules.push({ file: rel, exports, consumers: new Map() });
    }
  }

  // Pass 2: find consumers
  for (const [consumerFile, content] of fileContents) {
    const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRe.exec(content)) !== null) {
      const names = match[1]!.split(",").map((n) => n.trim().split(/\s+as\s+/)[0]!.trim()).filter(Boolean);
      const importPath = match[2]!;

      if (!importPath.startsWith(".")) continue;

      // Resolve the import to a module
      const resolved = path.resolve(path.dirname(path.join(rootDir, consumerFile)), importPath)
        .replace(/\.js$/, ".ts");
      const relResolved = path.relative(rootDir, resolved);

      const mod = modules.find((m) => m.file === relResolved || m.file === relResolved + ".ts");
      if (mod) {
        mod.consumers.set(consumerFile, names);
      }
    }
  }

  return modules;
}

export function formatReport(rootDir: string): string {
  const modules = mapApiSurface(rootDir);
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║           API SURFACE MAP                       ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  lines.push("");

  // Sort by number of consumers (most depended-on first)
  const sorted = [...modules].sort((a, b) => b.consumers.size - a.consumers.size);

  for (const mod of sorted) {
    const consumerCount = mod.consumers.size;
    const stability = consumerCount > 3 ? " ⚠ STABLE (many dependents)" : "";
    lines.push(`┌─── ${mod.file} (${mod.exports.length} exports, ${consumerCount} consumers)${stability}`);

    // Exports
    for (const exp of mod.exports) {
      const usedBy = [...mod.consumers.entries()]
        .filter(([_, names]) => names.includes(exp.name))
        .map(([file]) => path.basename(file, ".ts"));
      const usedStr = usedBy.length > 0 ? ` → ${usedBy.join(", ")}` : " → UNUSED";
      lines.push(`│  ${exp.kind.padEnd(10)} ${exp.name}${usedStr}`);
    }

    lines.push("└");
    lines.push("");
  }

  // Summary
  const totalExports = modules.reduce((s, m) => s + m.exports.length, 0);
  const unusedExports = modules.reduce((s, m) => {
    return s + m.exports.filter((e) => {
      return ![...m.consumers.values()].some((names) => names.includes(e.name));
    }).length;
  }, 0);

  lines.push(`Total: ${modules.length} modules, ${totalExports} exports, ${unusedExports} potentially unused`);

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

if (process.argv[1]?.endsWith("api-surface.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  console.log(formatReport(rootDir));
}
