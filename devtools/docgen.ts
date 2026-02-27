/**
 * Auto-documentation generator.
 *
 * Generates documentation directly from source code. Like tests verify
 * behavior, docs should accurately represent the code — generated, not
 * hand-maintained.
 *
 * Extracts:
 * - Module-level JSDoc comments
 * - Exported function signatures with JSDoc
 * - Type/interface definitions
 * - Import dependencies
 * - Tool definitions (Zod schemas for AI SDK tools)
 *
 * Usage:
 *   npx tsx devtools/docgen.ts [--root src/] [--out docs/]
 */

import fs from "node:fs";
import path from "node:path";

export type ModuleDoc = {
  file: string;
  moduleComment: string | null;
  exports: ExportDoc[];
  imports: ImportDoc[];
  types: TypeDoc[];
};

export type ExportDoc = {
  name: string;
  kind: "function" | "const" | "class" | "type" | "interface" | "enum";
  signature: string;
  jsdoc: string | null;
  line: number;
  params: ParamDoc[];
  returnType: string | null;
};

export type ImportDoc = {
  names: string[];
  source: string;
  isLocal: boolean;
};

export type TypeDoc = {
  name: string;
  kind: "type" | "interface" | "enum";
  definition: string;
  jsdoc: string | null;
  line: number;
};

export type ParamDoc = {
  name: string;
  type: string;
  optional: boolean;
  description: string | null;
};

// --- Extractors ---

/**
 * Extract the module-level comment (first JSDoc or block comment in file).
 */
export function extractModuleComment(content: string): string | null {
  const match = content.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (!match) return null;
  return match[1]!
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

/**
 * Extract JSDoc comment immediately preceding a line.
 */
function extractJsdoc(content: string, targetIndex: number): string | null {
  // Look backwards from targetIndex for a JSDoc comment
  const before = content.slice(0, targetIndex);
  const match = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
  if (!match) return null;
  return match[1]!
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

/**
 * Extract @param tags from JSDoc.
 */
function extractParamDocs(jsdoc: string | null): Map<string, string> {
  const params = new Map<string, string>();
  if (!jsdoc) return params;
  const re = /@param\s+(?:\{[^}]+\}\s+)?(\w+)\s+(.*)/g;
  let m;
  while ((m = re.exec(jsdoc)) !== null) {
    params.set(m[1]!, m[2]!.trim());
  }
  return re.lastIndex = 0, params;
}

/**
 * Parse function parameters from a signature.
 */
function parseParams(paramStr: string, jsdocParams: Map<string, string>): ParamDoc[] {
  if (!paramStr.trim()) return [];
  return paramStr.split(",").map((p) => {
    const trimmed = p.trim();
    const optional = trimmed.includes("?");
    const nameMatch = trimmed.match(/^(\w+)/);
    const name = nameMatch?.[1] ?? trimmed;
    const typeMatch = trimmed.match(/:\s*(.+?)(?:\s*=|$)/);
    const type = typeMatch?.[1]?.trim() ?? "unknown";
    return {
      name,
      type,
      optional,
      description: jsdocParams.get(name) ?? null,
    };
  });
}

/**
 * Extract all exported members from a file.
 */
export function extractExports(content: string, fileName: string): ExportDoc[] {
  const exports: ExportDoc[] = [];

  // Functions
  const funcRe = /export\s+(async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g;
  let m;
  while ((m = funcRe.exec(content)) !== null) {
    const jsdoc = extractJsdoc(content, m.index);
    const paramDocs = extractParamDocs(jsdoc);
    const line = content.slice(0, m.index).split("\n").length;
    exports.push({
      name: m[2]!,
      kind: "function",
      signature: m[0].replace(/\s*\{$/, ""),
      jsdoc: jsdoc ? jsdoc.replace(/@param\s+.*/g, "").trim() || null : null,
      line,
      params: parseParams(m[3] ?? "", paramDocs),
      returnType: m[4]?.trim() ?? null,
    });
  }

  // Const/arrow
  const constRe = /export\s+const\s+(\w+)(?:\s*:\s*([^=]+))?\s*=/g;
  while ((m = constRe.exec(content)) !== null) {
    const jsdoc = extractJsdoc(content, m.index);
    const line = content.slice(0, m.index).split("\n").length;
    exports.push({
      name: m[1]!,
      kind: "const",
      signature: `export const ${m[1]}${m[2] ? `: ${m[2].trim()}` : ""}`,
      jsdoc: jsdoc ? jsdoc.replace(/@param\s+.*/g, "").trim() || null : null,
      line,
      params: [],
      returnType: m[2]?.trim() ?? null,
    });
  }

  // Classes
  const classRe = /export\s+class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
  while ((m = classRe.exec(content)) !== null) {
    const jsdoc = extractJsdoc(content, m.index);
    const line = content.slice(0, m.index).split("\n").length;
    exports.push({
      name: m[1]!,
      kind: "class",
      signature: m[0].replace(/\s*\{$/, ""),
      jsdoc: jsdoc ? jsdoc.replace(/@param\s+.*/g, "").trim() || null : null,
      line,
      params: [],
      returnType: null,
    });
  }

  return exports;
}

/**
 * Extract type/interface definitions.
 */
export function extractTypes(content: string): TypeDoc[] {
  const types: TypeDoc[] = [];

  // Types
  const typeRe = /export\s+type\s+(\w+)(?:<[^>]+>)?\s*=\s*([\s\S]*?)(?:;\s*$|\n\n)/gm;
  let m;
  while ((m = typeRe.exec(content)) !== null) {
    const jsdoc = extractJsdoc(content, m.index);
    const line = content.slice(0, m.index).split("\n").length;
    types.push({
      name: m[1]!,
      kind: "type",
      definition: m[0].trim(),
      jsdoc,
      line,
    });
  }

  // Interfaces
  const ifaceRe = /export\s+interface\s+(\w+)(?:<[^>]+>)?\s*\{([\s\S]*?)\n\}/g;
  while ((m = ifaceRe.exec(content)) !== null) {
    const jsdoc = extractJsdoc(content, m.index);
    const line = content.slice(0, m.index).split("\n").length;
    types.push({
      name: m[1]!,
      kind: "interface",
      definition: m[0].trim(),
      jsdoc,
      line,
    });
  }

  // Enums
  const enumRe = /export\s+enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  while ((m = enumRe.exec(content)) !== null) {
    const jsdoc = extractJsdoc(content, m.index);
    const line = content.slice(0, m.index).split("\n").length;
    types.push({
      name: m[1]!,
      kind: "enum",
      definition: m[0].trim(),
      jsdoc,
      line,
    });
  }

  return types;
}

/**
 * Extract imports.
 */
export function extractImports(content: string): ImportDoc[] {
  const imports: ImportDoc[] = [];
  const re = /import\s+(?:(\w+)|(?:\{([^}]+)\}))\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const defaultName = m[1];
    const namedStr = m[2];
    const source = m[3]!;
    const names: string[] = [];
    if (defaultName) names.push(defaultName);
    if (namedStr) {
      names.push(...namedStr.split(",").map((n) => n.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean));
    }
    imports.push({ names, source, isLocal: source.startsWith(".") });
  }
  return imports;
}

/**
 * Generate full documentation for a module.
 */
export function documentModule(content: string, fileName: string): ModuleDoc {
  return {
    file: fileName,
    moduleComment: extractModuleComment(content),
    exports: extractExports(content, fileName),
    imports: extractImports(content),
    types: extractTypes(content),
  };
}

// --- Formatters ---

/**
 * Format a module doc as Markdown.
 */
export function formatModuleMarkdown(doc: ModuleDoc): string {
  const lines: string[] = [];

  lines.push(`## ${doc.file}`);
  lines.push("");

  if (doc.moduleComment) {
    lines.push(doc.moduleComment);
    lines.push("");
  }

  // Dependencies
  const localDeps = doc.imports.filter((i) => i.isLocal);
  const externalDeps = doc.imports.filter((i) => !i.isLocal);
  if (localDeps.length > 0 || externalDeps.length > 0) {
    lines.push("**Dependencies:**");
    for (const dep of externalDeps) {
      lines.push(`- \`${dep.source}\` (${dep.names.join(", ")})`);
    }
    for (const dep of localDeps) {
      lines.push(`- \`${dep.source}\` (${dep.names.join(", ")})`);
    }
    lines.push("");
  }

  // Types
  if (doc.types.length > 0) {
    lines.push("### Types");
    lines.push("");
    for (const t of doc.types) {
      lines.push(`#### \`${t.kind} ${t.name}\``);
      if (t.jsdoc) lines.push(`> ${t.jsdoc}`);
      lines.push("```typescript");
      lines.push(t.definition);
      lines.push("```");
      lines.push("");
    }
  }

  // Exports
  if (doc.exports.length > 0) {
    lines.push("### Exports");
    lines.push("");
    for (const exp of doc.exports) {
      lines.push(`#### \`${exp.name}\` (${exp.kind})`);
      if (exp.jsdoc) lines.push(`> ${exp.jsdoc}`);
      lines.push("```typescript");
      lines.push(exp.signature);
      lines.push("```");
      if (exp.params.length > 0) {
        lines.push("| Param | Type | Required | Description |");
        lines.push("|-------|------|----------|-------------|");
        for (const p of exp.params) {
          lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.optional ? "No" : "Yes"} | ${p.description ?? "-"} |`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Generate full project documentation.
 */
export function generateDocs(rootDir: string): string {
  const files = findTsFiles(rootDir);
  const docs: ModuleDoc[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(rootDir, file);
    docs.push(documentModule(content, rel));
  }

  // Sort: root files first, then by directory
  docs.sort((a, b) => {
    const aDir = path.dirname(a.file);
    const bDir = path.dirname(b.file);
    if (aDir === "." && bDir !== ".") return -1;
    if (aDir !== "." && bDir === ".") return 1;
    return a.file.localeCompare(b.file);
  });

  const lines: string[] = [];
  lines.push("# Miniclaw API Reference");
  lines.push("");
  lines.push(`> Auto-generated from source on ${new Date().toISOString().split("T")[0]}`);
  lines.push(`> ${docs.length} modules, ${docs.reduce((s, d) => s + d.exports.length, 0)} exports, ${docs.reduce((s, d) => s + d.types.length, 0)} types`);
  lines.push("");

  // Table of contents
  lines.push("## Table of Contents");
  lines.push("");
  const byDir = new Map<string, ModuleDoc[]>();
  for (const doc of docs) {
    const dir = path.dirname(doc.file) || ".";
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(doc);
  }
  for (const [dir, mods] of [...byDir.entries()].sort()) {
    const label = dir === "." ? "Core" : dir;
    lines.push(`### ${label}`);
    for (const mod of mods) {
      const anchor = mod.file.replace(/[/.]/g, "").toLowerCase();
      lines.push(`- [${mod.file}](#${anchor})`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Module docs
  for (const doc of docs) {
    lines.push(formatModuleMarkdown(doc));
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Write docs to output directory.
 */
export function writeDocs(rootDir: string, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });

  // Full reference
  const fullDoc = generateDocs(rootDir);
  fs.writeFileSync(path.join(outDir, "API.md"), fullDoc);

  // Per-module docs
  const files = findTsFiles(rootDir);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(rootDir, file);
    const doc = documentModule(content, rel);
    const moduleDoc = formatModuleMarkdown(doc);

    const outFile = path.join(outDir, rel.replace(/\.ts$/, ".md"));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, moduleDoc);
  }
}

// --- Helpers ---

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

if (process.argv[1]?.endsWith("docgen.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  const outIdx = args.indexOf("--out");
  const outDir = path.resolve(outIdx !== -1 ? args[outIdx + 1] ?? "docs" : "docs");

  if (args.includes("--stdout")) {
    console.log(generateDocs(rootDir));
  } else {
    writeDocs(rootDir, outDir);
    console.log(`Documentation written to ${outDir}/`);
  }
}
