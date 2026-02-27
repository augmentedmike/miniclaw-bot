import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  extractModuleComment,
  extractExports,
  extractTypes,
  extractImports,
  documentModule,
  formatModuleMarkdown,
  generateDocs,
  writeDocs,
} from "./docgen.js";

describe("docgen", () => {
  describe("extractModuleComment", () => {
    it("extracts leading JSDoc comment", () => {
      const code = `/**
 * This is the module description.
 * It has multiple lines.
 */
import fs from "node:fs";
`;
      const result = extractModuleComment(code);
      expect(result).toContain("This is the module description");
      expect(result).toContain("It has multiple lines");
    });

    it("returns null when no module comment", () => {
      const code = `import fs from "node:fs";\nconst x = 1;`;
      expect(extractModuleComment(code)).toBeNull();
    });
  });

  describe("extractExports", () => {
    it("extracts function signatures", () => {
      const code = `
/**
 * Add two numbers.
 * @param a First number
 * @param b Second number
 */
export function add(a: number, b: number): number {
  return a + b;
}
`;
      const exports = extractExports(code, "test.ts");
      const fn = exports.find((e) => e.name === "add");
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe("function");
      expect(fn!.params).toHaveLength(2);
      expect(fn!.params[0]!.name).toBe("a");
      expect(fn!.params[0]!.description).toBe("First number");
      expect(fn!.returnType).toBe("number");
    });

    it("extracts async functions", () => {
      const code = `export async function fetchData(url: string): Promise<string> { return ""; }`;
      const exports = extractExports(code, "test.ts");
      expect(exports.find((e) => e.name === "fetchData")).toBeDefined();
    });

    it("extracts const exports", () => {
      const code = `export const VERSION: string = "1.0.0";`;
      const exports = extractExports(code, "test.ts");
      const v = exports.find((e) => e.name === "VERSION");
      expect(v).toBeDefined();
      expect(v!.kind).toBe("const");
    });

    it("extracts class exports", () => {
      const code = `export class Parser extends Base { }`;
      const exports = extractExports(code, "test.ts");
      expect(exports.find((e) => e.name === "Parser")).toBeDefined();
    });
  });

  describe("extractTypes", () => {
    it("extracts type aliases", () => {
      const code = `export type Config = {\n  model: string;\n  maxSteps: number;\n};\n\n`;
      const types = extractTypes(code);
      expect(types.find((t) => t.name === "Config")).toBeDefined();
    });

    it("extracts interfaces", () => {
      const code = `export interface Handler {\n  handle(msg: string): void;\n}`;
      const types = extractTypes(code);
      expect(types.find((t) => t.name === "Handler")).toBeDefined();
    });

    it("extracts enums", () => {
      const code = `export enum Status {\n  Active,\n  Inactive\n}`;
      const types = extractTypes(code);
      expect(types.find((t) => t.name === "Status")).toBeDefined();
    });
  });

  describe("extractImports", () => {
    it("extracts named and default imports", () => {
      const code = `
import fs from "node:fs";
import { z } from "zod";
import { loadConfig } from "./config.js";
`;
      const imports = extractImports(code);
      expect(imports).toHaveLength(3);
      expect(imports.find((i) => i.source === "node:fs")).toBeDefined();
      expect(imports.find((i) => i.isLocal)).toBeDefined();
    });
  });

  describe("formatModuleMarkdown", () => {
    it("formats a complete module doc", () => {
      const doc = documentModule(`
/**
 * Configuration loader.
 */
import { z } from "zod";

export type Config = {
  model: string;
};

/**
 * Load configuration from disk.
 */
export function loadConfig(path: string): Config {
  return { model: "sonnet" };
}
`, "config.ts");

      const md = formatModuleMarkdown(doc);
      expect(md).toContain("## config.ts");
      expect(md).toContain("Configuration loader");
      expect(md).toContain("### Exports");
      expect(md).toContain("`loadConfig`");
      expect(md).toContain("`zod`");
    });
  });

  describe("generateDocs / writeDocs", () => {
    let tmpDir: string;
    let outDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-docgen-"));
      outDir = path.join(tmpDir, "docs");
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("generates full project docs", () => {
      fs.writeFileSync(path.join(tmpDir, "agent.ts"), `
/**
 * Agent module.
 */
export function runAgent(msg: string): string { return msg; }
`);
      fs.writeFileSync(path.join(tmpDir, "config.ts"), `
export function loadConfig(): object { return {}; }
`);

      const output = generateDocs(tmpDir);
      expect(output).toContain("# Miniclaw API Reference");
      expect(output).toContain("agent.ts");
      expect(output).toContain("config.ts");
      expect(output).toContain("Auto-generated");
    });

    it("writes per-module docs", () => {
      fs.mkdirSync(path.join(tmpDir, "tools"));
      fs.writeFileSync(path.join(tmpDir, "agent.ts"), `export function run() {}`);
      fs.writeFileSync(path.join(tmpDir, "tools", "shell.ts"), `export function exec() {}`);

      writeDocs(tmpDir, outDir);

      expect(fs.existsSync(path.join(outDir, "API.md"))).toBe(true);
      expect(fs.existsSync(path.join(outDir, "agent.md"))).toBe(true);
      expect(fs.existsSync(path.join(outDir, "tools", "shell.md"))).toBe(true);
    });
  });
});
