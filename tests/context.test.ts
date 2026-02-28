import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

vi.mock("@src/config.js", () => ({
  getMinicawHome: () => tmpDir,
  getActivePersonaHome: () => tmpDir,
}));

// Mock KB module — throw so context.ts falls through to qmd path
vi.mock("@src/kb/index.js", () => ({
  getKB: () => { throw new Error("KB not available in test"); },
}));

// Mock child_process — qmd IS installed, simulate search
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execSync: (cmd: string, ...args: unknown[]) => {
      if (typeof cmd === "string" && cmd.includes("which qmd")) {
        return "/usr/local/bin/qmd";
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd search")) {
        const memDir = path.join(tmpDir, "memory");
        const queryMatch = cmd.match(/qmd search '([^']+)'/);
        const query = queryMatch?.[1] ?? "";
        return simulateSearch(memDir, query);
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd vsearch")) {
        const memDir = path.join(tmpDir, "memory");
        const queryMatch = cmd.match(/qmd vsearch '([^']+)'/);
        const query = queryMatch?.[1] ?? "";
        return simulateSearch(memDir, query);
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd collection")) {
        return "miniclaw-memory";
      }
      if (typeof cmd === "string" && cmd.startsWith("qmd embed")) {
        return "";
      }
      // @ts-ignore
      return actual.execSync(cmd, ...args);
    },
    spawn: vi.fn(() => ({ unref: vi.fn() })),
  };
});

function simulateSearch(memDir: string, query: string): string {
  const results: { path: string; line: number; snippet: string; score: number }[] = [];
  const queryLower = query.toLowerCase();
  let files: string[];
  try {
    files = fs.readdirSync(memDir).filter((f) => f.endsWith(".md"));
  } catch {
    return JSON.stringify([]);
  }
  for (const file of files) {
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
  }
  return JSON.stringify(results);
}

const { retrieveContext, saveContext } = await import("@src/context.js");

describe("retrieveContext", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-ctx-"));
    fs.mkdirSync(path.join(tmpDir, "memory"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty string when no memory files exist", async () => {
    expect(await retrieveContext("anything")).toBe("");
  });

  it("returns formatted context when KB has matching content", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "memory", "prefs.md"),
      "# Preferences\n\nI prefer PostgreSQL over MySQL\n",
    );
    const result = await retrieveContext("PostgreSQL");
    expect(result).toContain("PostgreSQL");
    expect(result).toContain("[prefs]");
  });

  it("returns empty string when no matches found", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "memory", "notes.md"),
      "# Notes\n\nNothing relevant here\n",
    );
    expect(await retrieveContext("xyznonexistent")).toBe("");
  });
});

describe("saveContext", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-ctx-"));
    fs.mkdirSync(path.join(tmpDir, "memory"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a dated conversation file", async () => {
    await saveContext("cli", "hello", "hi there");
    const files = fs.readdirSync(path.join(tmpDir, "memory"));
    const convFile = files.find((f) => f.startsWith("conversation-"));
    expect(convFile).toBeDefined();
  });

  it("includes channel, user message, and agent response", async () => {
    await saveContext("telegram", "what time is it?", "It is 3pm");
    const files = fs.readdirSync(path.join(tmpDir, "memory"));
    const convFile = files.find((f) => f.startsWith("conversation-"))!;
    const content = fs.readFileSync(path.join(tmpDir, "memory", convFile), "utf8");
    expect(content).toContain("[telegram]");
    expect(content).toContain("what time is it?");
    expect(content).toContain("It is 3pm");
  });

  it("appends to existing daily file", async () => {
    await saveContext("cli", "first question", "first answer");
    await saveContext("cli", "second question", "second answer");
    const files = fs.readdirSync(path.join(tmpDir, "memory"));
    const convFiles = files.filter((f) => f.startsWith("conversation-"));
    // Same day, same file
    expect(convFiles).toHaveLength(1);
    const content = fs.readFileSync(path.join(tmpDir, "memory", convFiles[0]!), "utf8");
    expect(content).toContain("first question");
    expect(content).toContain("second question");
  });

  it("truncates long messages", async () => {
    const longMsg = "x".repeat(600);
    await saveContext("cli", longMsg, "short");
    const files = fs.readdirSync(path.join(tmpDir, "memory"));
    const convFile = files.find((f) => f.startsWith("conversation-"))!;
    const content = fs.readFileSync(path.join(tmpDir, "memory", convFile), "utf8");
    expect(content).toContain("...");
    // Should not contain the full 300-char string
    expect(content).not.toContain(longMsg);
  });
});
