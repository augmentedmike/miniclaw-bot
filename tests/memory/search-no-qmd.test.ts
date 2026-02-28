import { describe, expect, it, vi } from "vitest";

vi.mock("@src/config.js", () => ({
  getMinicawHome: () => "/tmp/miniclaw-test-noqmd",
  getActivePersonaHome: () => "/tmp/miniclaw-test-noqmd",
}));

// Mock child_process — qmd is NOT installed
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execSync: (cmd: string, ...args: unknown[]) => {
      if (typeof cmd === "string" && cmd.includes("which qmd")) {
        throw new Error("qmd not found");
      }
      // @ts-ignore
      return actual.execSync(cmd, ...args);
    },
    spawn: vi.fn(() => ({ unref: vi.fn() })),
  };
});

const { searchMemory, vectorSearchMemory, deepSearchMemory, ensureQmdCollection, indexMemory } =
  await import("@memory/search.js");

describe("qmd not installed", () => {
  it("searchMemory throws", () => {
    expect(() => searchMemory("anything")).toThrow("qmd is not installed");
  });

  it("vectorSearchMemory throws", () => {
    expect(() => vectorSearchMemory("anything")).toThrow("qmd is not installed");
  });

  it("deepSearchMemory throws", () => {
    expect(() => deepSearchMemory("anything")).toThrow("qmd is not installed");
  });

  it("ensureQmdCollection throws", () => {
    expect(() => ensureQmdCollection()).toThrow("qmd is not installed");
  });

  it("indexMemory throws", () => {
    expect(() => indexMemory()).toThrow("qmd is not installed");
  });

  it("error message includes install instructions", () => {
    expect(() => searchMemory("test")).toThrow("npm install -g @tobilu/qmd");
  });
});
