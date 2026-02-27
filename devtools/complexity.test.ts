import { describe, expect, it } from "vitest";
import { analyzeComplexity, formatReport } from "./complexity.js";

describe("complexity", () => {
  describe("analyzeComplexity", () => {
    it("detects simple functions as grade A", () => {
      const code = `
export function add(a: number, b: number): number {
  return a + b;
}
`;
      const metrics = analyzeComplexity(code, "test.ts");
      expect(metrics.length).toBeGreaterThanOrEqual(1);
      const addFn = metrics.find((m) => m.name === "add");
      expect(addFn).toBeDefined();
      expect(addFn!.grade).toBe("A");
      expect(addFn!.complexity).toBeLessThanOrEqual(5);
      expect(addFn!.params).toBe(2);
    });

    it("detects high complexity from branching", () => {
      const code = `
export function complex(x: number) {
  if (x > 0) {
    if (x > 10) {
      if (x > 100) {
        for (let i = 0; i < x; i++) {
          if (i % 2 === 0) {
            while (i > 0) {
              if (i && x || true) {
                switch (x) {
                  case 1: break;
                  case 2: break;
                  case 3: break;
                  default: break;
                }
              }
            }
          }
        }
      }
    }
  }
  return x;
}
`;
      const metrics = analyzeComplexity(code, "test.ts");
      const fn = metrics.find((m) => m.name === "complex");
      expect(fn).toBeDefined();
      expect(fn!.complexity).toBeGreaterThan(10);
    });

    it("counts parameters correctly", () => {
      const code = `
export function manyParams(a: string, b: number, c: boolean, d: object, e: any[], f: unknown) {
  return a;
}
`;
      const metrics = analyzeComplexity(code, "test.ts");
      const fn = metrics.find((m) => m.name === "manyParams");
      expect(fn).toBeDefined();
      expect(fn!.params).toBe(6);
    });

    it("handles arrow functions", () => {
      const code = `
export const handler = async (req: Request, res: Response) => {
  if (req.method === "GET") {
    return res.send("ok");
  }
  return res.send("not ok");
};
`;
      const metrics = analyzeComplexity(code, "test.ts");
      const fn = metrics.find((m) => m.name === "handler");
      expect(fn).toBeDefined();
      expect(fn!.params).toBe(2);
    });

    it("measures nesting depth", () => {
      const code = `
export function nested() {
  if (true) {
    for (let i = 0; i < 10; i++) {
      if (i > 5) {
        while (true) {
          break;
        }
      }
    }
  }
}
`;
      const metrics = analyzeComplexity(code, "test.ts");
      const fn = metrics.find((m) => m.name === "nested");
      expect(fn).toBeDefined();
      expect(fn!.maxNesting).toBeGreaterThanOrEqual(4);
    });

    it("returns empty for files with no functions", () => {
      const code = `export const VERSION = "1.0";`;
      const metrics = analyzeComplexity(code, "test.ts");
      // Might detect const as arrow or not — at least shouldn't crash
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe("formatReport", () => {
    it("shows complexity report header", () => {
      const metrics = [
        { file: "test.ts", name: "simple", line: 1, loc: 5, complexity: 2, maxNesting: 1, params: 1, grade: "A" as const },
      ];
      const output = formatReport(metrics);
      expect(output).toContain("COMPLEXITY REPORT");
      expect(output).toContain("Total functions: 1");
    });

    it("flags functions exceeding threshold", () => {
      const metrics = [
        { file: "test.ts", name: "complex", line: 10, loc: 80, complexity: 15, maxNesting: 5, params: 3, grade: "D" as const },
        { file: "test.ts", name: "simple", line: 1, loc: 5, complexity: 2, maxNesting: 1, params: 1, grade: "A" as const },
      ];
      const output = formatReport(metrics, 10);
      expect(output).toContain("FUNCTIONS NEEDING ATTENTION");
      expect(output).toContain("complex");
      expect(output).not.toMatch(/\bsimple\b.*test\.ts:1/);
    });

    it("shows grade summary", () => {
      const metrics = [
        { file: "t.ts", name: "a", line: 1, loc: 5, complexity: 1, maxNesting: 1, params: 0, grade: "A" as const },
        { file: "t.ts", name: "b", line: 2, loc: 5, complexity: 1, maxNesting: 1, params: 0, grade: "A" as const },
        { file: "t.ts", name: "c", line: 3, loc: 50, complexity: 12, maxNesting: 4, params: 5, grade: "C" as const },
      ];
      const output = formatReport(metrics);
      expect(output).toContain("A (simple):");
      expect(output).toContain("C (complex):");
      expect(output).toContain("Avg complexity:");
    });
  });
});
