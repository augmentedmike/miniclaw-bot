import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

vi.mock("@src/config.js", () => ({
  getMinicawHome: () => tmpDir,
  getActivePersonaHome: () => tmpDir,
}));

// Mock child_process — qmd IS installed, and we simulate its JSON output
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execSync: (cmd: string, ...args: unknown[]) => {
      if (typeof cmd === "string" && cmd.includes("which qmd")) {
        return "/usr/local/bin/qmd"; // qmd is installed
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd search")) {
        // Read files from tmpDir/memory and do substring matching
        const memDir = path.join(tmpDir, "memory");
        const queryMatch = cmd.match(/qmd search '([^']+)'/);
        const query = queryMatch?.[1] ?? "";
        return simulateQmdSearch(memDir, query);
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd vsearch")) {
        const memDir = path.join(tmpDir, "memory");
        const queryMatch = cmd.match(/qmd vsearch '([^']+)'/);
        const query = queryMatch?.[1] ?? "";
        return simulateQmdSearch(memDir, query);
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd query")) {
        const memDir = path.join(tmpDir, "memory");
        const queryMatch = cmd.match(/qmd query '([^']+)'/);
        const query = queryMatch?.[1] ?? "";
        return simulateQmdSearch(memDir, query);
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd collection")) {
        return "miniclaw-memory";
      }
      // @ts-ignore
      return actual.execSync(cmd, ...args);
    },
    spawn: vi.fn(() => ({ unref: vi.fn() })),
  };
});

/** Simulate qmd JSON output by doing substring matching on .md files */
function simulateQmdSearch(memDir: string, query: string): string {
  const results: { path: string; line: number; snippet: string; score: number }[] = [];
  const queryLower = query.toLowerCase();

  let files: string[];
  try {
    files = fs.readdirSync(memDir).filter((f) => f.endsWith(".md"));
  } catch {
    return JSON.stringify([]);
  }

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(memDir, file), "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.toLowerCase().includes(queryLower)) {
          results.push({
            path: file.replace(/\.md$/, ""),
            line: i + 1,
            snippet: lines[i]!,
            score: 1.0,
          });
        }
      }
    } catch {
      // skip
    }
  }

  return JSON.stringify(results);
}

const { searchMemory, vectorSearchMemory, deepSearchMemory } = await import("@memory/search.js");

describe("searchMemory", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-test-"));
    fs.mkdirSync(path.join(tmpDir, "memory"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds matching lines across files", () => {
    fs.writeFileSync(
      path.join(tmpDir, "memory", "prefs.md"),
      "# Preferences\n\nI prefer TypeScript over JavaScript\nI like dark mode\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, "memory", "notes.md"),
      "# Notes\n\nRemember to buy milk\n",
    );

    const results = searchMemory("TypeScript");
    expect(results.length).toBe(1);
    expect(results[0]!.file).toBe("prefs");
    expect(results[0]!.snippet).toContain("TypeScript");
  });

  it("returns empty for no matches", () => {
    fs.writeFileSync(path.join(tmpDir, "memory", "test.md"), "nothing relevant\n");
    expect(searchMemory("xyznonexistent")).toEqual([]);
  });

  it("is case insensitive", () => {
    fs.writeFileSync(path.join(tmpDir, "memory", "test.md"), "Hello World\n");
    expect(searchMemory("hello")).toHaveLength(1);
  });

  it("handles empty memory directory", () => {
    expect(searchMemory("anything")).toEqual([]);
  });
});

describe("vectorSearchMemory", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-test-"));
    fs.mkdirSync(path.join(tmpDir, "memory"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds matching content via vector search", () => {
    fs.writeFileSync(
      path.join(tmpDir, "memory", "auth.md"),
      "# Auth\n\nOAuth login flow with JWT tokens\n",
    );
    const results = vectorSearchMemory("OAuth");
    expect(results.length).toBe(1);
    expect(results[0]!.snippet).toContain("OAuth");
  });
});

describe("deepSearchMemory", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-test-"));
    fs.mkdirSync(path.join(tmpDir, "memory"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds matching content via deep search", () => {
    fs.writeFileSync(
      path.join(tmpDir, "memory", "plans.md"),
      "# Plans\n\nMigrate database to PostgreSQL\n",
    );
    const results = deepSearchMemory("PostgreSQL");
    expect(results.length).toBe(1);
    expect(results[0]!.snippet).toContain("PostgreSQL");
  });
});

