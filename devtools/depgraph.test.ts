import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  extractImports,
  resolveImport,
  buildGraph,
  detectClusters,
  computeDegrees,
  detectCycles,
  formatAscii,
  formatMermaid,
} from "./depgraph.js";

describe("depgraph", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-depgraph-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("extractImports", () => {
    it("extracts static imports", () => {
      const content = `
import { foo } from "./foo.js";
import { bar } from "./bar.js";
import something from "external-lib";
`;
      const imports = extractImports(content);
      expect(imports).toContain("./foo.js");
      expect(imports).toContain("./bar.js");
      expect(imports).not.toContain("external-lib");
    });

    it("extracts dynamic imports", () => {
      const content = `
const mod = await import("./dynamic.js");
`;
      const imports = extractImports(content);
      expect(imports).toContain("./dynamic.js");
    });

    it("ignores node_modules imports", () => {
      const content = `import { z } from "zod";`;
      const imports = extractImports(content);
      expect(imports).toHaveLength(0);
    });

    it("extracts re-exports", () => {
      const content = `export { thing } from "./thing.js";`;
      const imports = extractImports(content);
      expect(imports).toContain("./thing.js");
    });
  });

  describe("resolveImport", () => {
    it("resolves .js to .ts", () => {
      fs.writeFileSync(path.join(tmpDir, "foo.ts"), "");
      const result = resolveImport(path.join(tmpDir, "bar.ts"), "./foo.js", tmpDir);
      expect(result).toBe("foo.ts");
    });

    it("resolves without extension", () => {
      fs.writeFileSync(path.join(tmpDir, "foo.ts"), "");
      const result = resolveImport(path.join(tmpDir, "bar.ts"), "./foo", tmpDir);
      expect(result).toBe("foo.ts");
    });

    it("resolves directory when it exists (fs.existsSync matches dir)", () => {
      fs.mkdirSync(path.join(tmpDir, "sub"));
      fs.writeFileSync(path.join(tmpDir, "sub", "index.ts"), "");
      const result = resolveImport(path.join(tmpDir, "bar.ts"), "./sub", tmpDir);
      // Directory itself passes existsSync, so it resolves to "sub" not "sub/index.ts"
      expect(result).toBe("sub");
    });

    it("returns null for unresolvable imports", () => {
      const result = resolveImport(path.join(tmpDir, "bar.ts"), "./nonexistent", tmpDir);
      expect(result).toBeNull();
    });
  });

  describe("buildGraph", () => {
    it("builds a graph from files with imports", () => {
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `import { foo } from "./b.js";`);
      fs.writeFileSync(path.join(tmpDir, "b.ts"), `export const foo = 1;`);
      const graph = buildGraph(tmpDir);
      expect(graph.nodes.has("a.ts")).toBe(true);
      expect(graph.nodes.has("b.ts")).toBe(true);
      expect(graph.edges).toContainEqual({ from: "a.ts", to: "b.ts" });
    });

    it("skips test files", () => {
      fs.writeFileSync(path.join(tmpDir, "a.ts"), "");
      fs.writeFileSync(path.join(tmpDir, "a.test.ts"), `import { foo } from "./a.js";`);
      const graph = buildGraph(tmpDir);
      expect(graph.nodes.has("a.test.ts")).toBe(false);
    });

    it("handles files with no imports", () => {
      fs.writeFileSync(path.join(tmpDir, "standalone.ts"), `export const x = 1;`);
      const graph = buildGraph(tmpDir);
      expect(graph.nodes.has("standalone.ts")).toBe(true);
      expect(graph.edges).toHaveLength(0);
    });
  });

  describe("detectClusters", () => {
    it("groups files by directory", () => {
      const graph = {
        nodes: new Set(["tools/a.ts", "tools/b.ts", "telegram/c.ts"]),
        edges: [
          { from: "tools/a.ts", to: "tools/b.ts" },
          { from: "tools/a.ts", to: "telegram/c.ts" },
        ],
      };
      const clusters = detectClusters(graph);
      expect(clusters.get("tools")!.files).toContain("a.ts");
      expect(clusters.get("tools")!.files).toContain("b.ts");
      expect(clusters.get("tools")!.internalEdges).toBe(1);
      expect(clusters.get("tools")!.externalEdges).toHaveLength(1);
    });

    it("puts root files in '.' cluster", () => {
      const graph = {
        nodes: new Set(["index.ts", "config.ts"]),
        edges: [{ from: "index.ts", to: "config.ts" }],
      };
      const clusters = detectClusters(graph);
      expect(clusters.has(".")).toBe(true);
      expect(clusters.get(".")!.files).toContain("index.ts");
    });
  });

  describe("computeDegrees", () => {
    it("computes in and out degrees", () => {
      const graph = {
        nodes: new Set(["a.ts", "b.ts", "c.ts"]),
        edges: [
          { from: "a.ts", to: "b.ts" },
          { from: "a.ts", to: "c.ts" },
          { from: "c.ts", to: "b.ts" },
        ],
      };
      const degrees = computeDegrees(graph);
      expect(degrees.get("a.ts")).toEqual({ inDeg: 0, outDeg: 2 });
      expect(degrees.get("b.ts")).toEqual({ inDeg: 2, outDeg: 0 });
      expect(degrees.get("c.ts")).toEqual({ inDeg: 1, outDeg: 1 });
    });
  });

  describe("detectCycles", () => {
    it("detects circular dependencies", () => {
      const graph = {
        nodes: new Set(["a.ts", "b.ts"]),
        edges: [
          { from: "a.ts", to: "b.ts" },
          { from: "b.ts", to: "a.ts" },
        ],
      };
      const cycles = detectCycles(graph);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it("returns empty for acyclic graphs", () => {
      const graph = {
        nodes: new Set(["a.ts", "b.ts", "c.ts"]),
        edges: [
          { from: "a.ts", to: "b.ts" },
          { from: "b.ts", to: "c.ts" },
        ],
      };
      const cycles = detectCycles(graph);
      expect(cycles).toHaveLength(0);
    });
  });

  describe("formatAscii", () => {
    it("produces a formatted report", () => {
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `import { b } from "./b.js";`);
      fs.writeFileSync(path.join(tmpDir, "b.ts"), `export const b = 1;`);
      const graph = buildGraph(tmpDir);
      const output = formatAscii(graph);
      expect(output).toContain("DEPENDENCY GRAPH");
      expect(output).toContain("Modules:");
      expect(output).toContain("Files:");
    });

    it("marks entry points and hubs", () => {
      const graph = {
        nodes: new Set(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]),
        edges: [
          { from: "a.ts", to: "b.ts" },
          { from: "c.ts", to: "b.ts" },
          { from: "d.ts", to: "b.ts" },
          { from: "e.ts", to: "b.ts" },
        ],
      };
      const output = formatAscii(graph);
      expect(output).toContain("hub");
    });
  });

  describe("formatMermaid", () => {
    it("produces valid mermaid syntax", () => {
      const graph = {
        nodes: new Set(["tools/a.ts", "tools/b.ts"]),
        edges: [{ from: "tools/a.ts", to: "tools/b.ts" }],
      };
      const output = formatMermaid(graph);
      expect(output).toContain("graph TD");
      expect(output).toContain("subgraph tools");
      expect(output).toContain("-->");
    });
  });
});
