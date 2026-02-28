/**
 * Tests for the feature map generator.
 */

import { describe, it, expect } from "vitest";
import {
  extractModuleDoc,
  extractToolDescriptions,
  extractExports,
  extractFeatures,
  formatText,
  formatMarkdown,
  formatJson,
} from "./features.js";

describe("extractModuleDoc", () => {
  it("extracts a multi-line JSDoc block from the top of a file", () => {
    const content = `/**\n * Encrypted secrets vault.\n *\n * AES-256-GCM encrypted storage.\n */\nimport fs from "node:fs";`;
    const doc = extractModuleDoc(content);
    expect(doc).toContain("Encrypted secrets vault");
    expect(doc).toContain("AES-256-GCM");
  });

  it("returns null when no JSDoc comment exists", () => {
    const content = `import fs from "node:fs";\nconst x = 1;`;
    expect(extractModuleDoc(content)).toBeNull();
  });

  it("returns null when JSDoc starts after line 20", () => {
    const lines = Array(21).fill("// filler").join("\n");
    const content = lines + '\n/**\n * Late doc.\n */\nexport function foo() {}';
    expect(extractModuleDoc(content)).toBeNull();
  });

  it("strips asterisks and joins lines into a single string", () => {
    const content = `/**\n * Line one.\n * Line two.\n * Line three.\n */`;
    const doc = extractModuleDoc(content);
    expect(doc).toBe("Line one. Line two. Line three.");
  });
});

describe("extractToolDescriptions", () => {
  it("extracts single-line description strings", () => {
    const content = `tool({\n  description:\n    "Read the contents of a file. Returns text.",\n  parameters: z.object({}),\n});`;
    const descs = extractToolDescriptions(content);
    expect(descs.length).toBeGreaterThanOrEqual(1);
    expect(descs[0]).toContain("Read the contents of a file");
  });

  it("extracts multi-line concatenated descriptions", () => {
    const content = `tool({\n  description:\n    "First part. " +\n    "Second part. " +\n    "Third part.",\n  parameters: z.object({}),\n});`;
    const descs = extractToolDescriptions(content);
    expect(descs.length).toBeGreaterThanOrEqual(1);
    expect(descs[0]).toContain("First part");
    expect(descs[0]).toContain("Third part");
  });

  it("returns empty array for files with no tool descriptions", () => {
    const content = `export function foo() { return 1; }`;
    expect(extractToolDescriptions(content)).toEqual([]);
  });
});

describe("extractExports", () => {
  it("extracts function and const exports", () => {
    const content = `export function foo() {}\nexport const bar = 1;\nexport type Baz = string;`;
    const exports = extractExports(content);
    expect(exports).toContain("foo");
    expect(exports).toContain("bar");
    expect(exports).toContain("Baz");
  });

  it("extracts async function exports", () => {
    const content = `export async function runAgent() {}`;
    const exports = extractExports(content);
    expect(exports).toContain("runAgent");
  });

  it("returns empty array for no exports", () => {
    const content = `const x = 1;\nfunction internal() {}`;
    expect(extractExports(content)).toEqual([]);
  });
});

describe("extractFeatures", () => {
  it("returns a FeatureMap with features, stats, and product info", () => {
    const map = extractFeatures("src");
    expect(map.product).toBe("miniclaw");
    expect(map.version).toBeDefined();
    expect(map.features.length).toBeGreaterThan(5);
    expect(map.stats.totalFeatures).toBe(map.features.length);
    expect(map.stats.totalFiles).toBeGreaterThan(0);
    expect(map.stats.totalCapabilities).toBeGreaterThan(0);
  });

  it("detects known features by name", () => {
    const map = extractFeatures("src");
    const names = map.features.map((f) => f.name);
    expect(names).toContain("AI Assistant");
    expect(names).toContain("Encrypted Vault");
    expect(names).toContain("Telegram Messaging");
    expect(names).toContain("Persistent Memory");
    expect(names).toContain("File Management");
    expect(names).toContain("System Access");
  });

  it("assigns files to features", () => {
    const map = extractFeatures("src");
    const vault = map.features.find((f) => f.name === "Encrypted Vault");
    expect(vault).toBeDefined();
    expect(vault!.files.some((f) => f.includes("vault"))).toBe(true);
  });

  it("assigns dependencies to features", () => {
    const map = extractFeatures("src");
    const telegram = map.features.find((f) => f.name === "Telegram Messaging");
    expect(telegram).toBeDefined();
    expect(telegram!.dependencies).toContain("grammy");
  });

  it("every feature has a non-empty description", () => {
    const map = extractFeatures("src");
    for (const feature of map.features) {
      expect(feature.description.length).toBeGreaterThan(10);
    }
  });
});

describe("formatters", () => {
  const map = extractFeatures("src");

  it("formatText produces ASCII output with feature names", () => {
    const text = formatText(map);
    expect(text).toContain("FEATURE MAP");
    expect(text).toContain("AI Assistant");
    expect(text).toContain("Encrypted Vault");
    expect(text).toContain("features |");
  });

  it("formatMarkdown produces markdown with headers", () => {
    const md = formatMarkdown(map);
    expect(md).toContain("# Feature Map");
    expect(md).toContain("## AI Assistant");
    expect(md).toContain("**Capabilities:**");
  });

  it("formatJson produces valid JSON", () => {
    const json = formatJson(map);
    const parsed = JSON.parse(json);
    expect(parsed.product).toBe("miniclaw");
    expect(parsed.features).toBeInstanceOf(Array);
  });
});
