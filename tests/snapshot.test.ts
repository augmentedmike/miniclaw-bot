import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("snapshot", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-snap-"));
    process.env.MINICLAW_HOME = tmpDir;

    // Create user structure with a persona
    const personaDir = path.join(tmpDir, "user", "personas", "test-agent");
    fs.mkdirSync(path.join(personaDir, "memory"), { recursive: true });
    fs.mkdirSync(path.join(personaDir, "conversations"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "user", "snapshots"), { recursive: true });

    fs.writeFileSync(
      path.join(personaDir, "persona.md"),
      "# TestAgent\n\n## Identity\n\nI am a test agent.\n",
    );
    fs.writeFileSync(
      path.join(personaDir, "config.json"),
      JSON.stringify({ model: "test-model" }),
    );
    fs.writeFileSync(
      path.join(personaDir, "memory", "facts.md"),
      "# Facts\n\nThe sky is blue.\n",
    );

    // Set active persona
    fs.writeFileSync(path.join(tmpDir, "user", "active-persona"), "test-agent");
  });

  afterEach(() => {
    delete process.env.MINICLAW_HOME;
    vi.resetModules();
  });

  it("exportSnapshot creates a .tar.gz archive", async () => {
    const { exportSnapshot } = await import("@src/snapshot.js");
    const archivePath = exportSnapshot("test");
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(archivePath).toMatch(/test-.*\.tar\.gz$/);
  });

  it("showSnapshot reads manifest from archive", async () => {
    const { exportSnapshot, showSnapshot } = await import("@src/snapshot.js");
    const archivePath = exportSnapshot("test");
    const manifest = showSnapshot(archivePath);
    expect(manifest).not.toBeNull();
    expect(manifest!.version).toBe(1);
    expect(manifest!.name).toBe("test");
    expect(manifest!.activePersona).toBe("test-agent");
    expect(manifest!.components.personas).toBe(true);
    expect(manifest!.components.memory).toBe(true);
    expect(manifest!.components.config).toBe(true);
  });

  it("listSnapshots returns archive filenames", async () => {
    const { exportSnapshot, listSnapshots } = await import("@src/snapshot.js");
    exportSnapshot("alpha");
    exportSnapshot("beta");
    const names = listSnapshots();
    expect(names.length).toBe(2);
    expect(names[0]).toMatch(/^alpha-/);
    expect(names[1]).toMatch(/^beta-/);
  });

  it("export/restore round-trip preserves persona data", async () => {
    const { exportSnapshot, restoreSnapshot } = await import("@src/snapshot.js");

    const archivePath = exportSnapshot("roundtrip");

    // Restore to a different directory
    const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-restore-"));
    restoreSnapshot(archivePath, { targetDir: restoreDir });

    // Verify persona was restored
    const restoredPersona = path.join(restoreDir, "user", "personas", "test-agent", "persona.md");
    expect(fs.existsSync(restoredPersona)).toBe(true);
    expect(fs.readFileSync(restoredPersona, "utf8")).toContain("I am a test agent");

    // Verify memory was restored
    const restoredMemory = path.join(restoreDir, "user", "personas", "test-agent", "memory", "facts.md");
    expect(fs.existsSync(restoredMemory)).toBe(true);
    expect(fs.readFileSync(restoredMemory, "utf8")).toContain("sky is blue");

    // Verify active persona was restored
    const activePath = path.join(restoreDir, "user", "active-persona");
    expect(fs.existsSync(activePath)).toBe(true);
    expect(fs.readFileSync(activePath, "utf8").trim()).toBe("test-agent");
  });

  it("restoreSnapshot preserves existing .vault-key", async () => {
    const { exportSnapshot, restoreSnapshot } = await import("@src/snapshot.js");

    // Create a vault key in the persona
    const keyPath = path.join(tmpDir, "user", "personas", "test-agent", ".vault-key");
    fs.writeFileSync(keyPath, "secret-local-key", { mode: 0o600 });

    const archivePath = exportSnapshot("vault-test");

    // Restore to a new dir that has a pre-existing vault key
    const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-restore-"));
    const restorePersonaDir = path.join(restoreDir, "user", "personas", "test-agent");
    fs.mkdirSync(restorePersonaDir, { recursive: true });
    fs.writeFileSync(
      path.join(restorePersonaDir, ".vault-key"),
      "existing-local-key",
      { mode: 0o600 },
    );

    restoreSnapshot(archivePath, { targetDir: restoreDir });

    // The existing vault key should be preserved (not overwritten by snapshot)
    const restoredKey = fs.readFileSync(
      path.join(restorePersonaDir, ".vault-key"),
      "utf8",
    );
    expect(restoredKey).toBe("existing-local-key");
  });
});
