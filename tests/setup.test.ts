import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock auth module
vi.mock("@src/auth.js", () => ({
  readCredentials: vi.fn(() => ({
    accessToken: "test-token",
    refreshToken: "test-refresh",
    expiresAt: Date.now() + 3600_000,
  })),
  isExpired: vi.fn(() => false),
}));

// Mock config module
vi.mock("@src/config.js", () => ({
  ensureMinicawDirs: vi.fn(),
}));

// Mock search module
vi.mock("@memory/search.js", () => ({
  ensureQmdCollection: vi.fn(),
  indexMemory: vi.fn(),
}));

// Mock child_process for qmd check
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execSync: (cmd: string, ...args: unknown[]) => {
      if (typeof cmd === "string" && cmd.includes("qmd --version")) {
        return "0.5.0";
      }
      // @ts-ignore
      return actual.execSync(cmd, ...args);
    },
  };
});

const { runSetup } = await import("@src/setup.js");

describe("setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs all checks successfully", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await runSetup();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith("miniclaw setup\n");
    expect(consoleSpy).toHaveBeenCalledWith("\nSetup complete.");

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("calls ensureMinicawDirs", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const { ensureMinicawDirs } = await import("@src/config.js");
    await runSetup();

    expect(ensureMinicawDirs).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("calls ensureQmdCollection and indexMemory", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const { ensureQmdCollection, indexMemory } = await import("@memory/search.js");
    await runSetup();

    expect(ensureQmdCollection).toHaveBeenCalled();
    expect(indexMemory).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("exits with 1 when credentials missing", async () => {
    const { readCredentials } = await import("@src/auth.js");
    (readCredentials as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

    vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await runSetup();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No Claude CLI credentials"));

    errorSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });
});
