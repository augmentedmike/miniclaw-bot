/**
 * Snapshot — export/restore complete agent state.
 *
 * Like Bob from the Bobiverse: checkpoint, restore, fork.
 * A snapshot is a .tar.gz containing everything needed to reconstruct
 * a persona on a new machine.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getUserDir, getSystemDir } from "./config.js";

export type SnapshotManifest = {
  version: 1;
  name: string;
  timestamp: string;
  activePersona: string | null;
  components: {
    personas: boolean;
    config: boolean;
    memory: boolean;
    conversations: boolean;
    vault: boolean;
    photoAlbum: boolean;
    personalityKG: boolean;
    worldKG: boolean;
  };
};

/**
 * Export the entire user/ directory as a snapshot archive.
 * Excludes .vault-key (stays local — portable but vault access
 * requires the key on the target machine).
 */
export function exportSnapshot(name?: string): string {
  const userDir = getUserDir();
  const snapshotsDir = path.join(userDir, "snapshots");
  fs.mkdirSync(snapshotsDir, { recursive: true });

  const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const snapshotName = name ?? "snapshot";
  const filename = `${snapshotName}-${date}.tar.gz`;
  const archivePath = path.join(snapshotsDir, filename);

  // Read active persona
  let activePersona: string | null = null;
  try {
    activePersona = fs.readFileSync(path.join(userDir, "active-persona"), "utf8").trim() || null;
  } catch { /* no active persona file */ }

  // Detect which components exist
  const personasDir = path.join(userDir, "personas");
  const hasPersonas = fs.existsSync(personasDir);

  // Collect persona dirs to check for components
  let hasMemory = false;
  let hasConversations = false;
  let hasVault = false;
  let hasConfig = false;

  if (hasPersonas) {
    try {
      const personas = fs.readdirSync(personasDir, { withFileTypes: true })
        .filter((d) => d.isDirectory());
      for (const p of personas) {
        const pDir = path.join(personasDir, p.name);
        if (fs.existsSync(path.join(pDir, "memory"))) hasMemory = true;
        if (fs.existsSync(path.join(pDir, "conversations"))) hasConversations = true;
        if (fs.existsSync(path.join(pDir, "vault.enc"))) hasVault = true;
        if (fs.existsSync(path.join(pDir, "config.json"))) hasConfig = true;
      }
    } catch { /* empty personas dir */ }
  }

  // Write manifest into user dir temporarily
  const manifest: SnapshotManifest = {
    version: 1,
    name: snapshotName,
    timestamp: new Date().toISOString(),
    activePersona,
    components: {
      personas: hasPersonas,
      config: hasConfig,
      memory: hasMemory,
      conversations: hasConversations,
      vault: hasVault,
      photoAlbum: false,
      personalityKG: false,
      worldKG: false,
    },
  };

  const manifestPath = path.join(userDir, "snapshot.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  // Build tar, excluding snapshots dir, .vault-key files, and bin/
  const excludes = [
    "--exclude=snapshots",
    "--exclude=.vault-key",
  ];

  execSync(
    `tar czf "${archivePath}" ${excludes.join(" ")} -C "${path.dirname(userDir)}" "${path.basename(userDir)}"`,
    { stdio: "pipe" },
  );

  // Clean up temporary manifest
  fs.unlinkSync(manifestPath);

  return archivePath;
}

/**
 * Restore a snapshot archive to a target directory.
 * Preserves existing .vault-key files.
 */
export function restoreSnapshot(
  archivePath: string,
  opts?: { targetDir?: string },
): void {
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Snapshot not found: ${archivePath}`);
  }

  const targetDir = opts?.targetDir ?? path.dirname(getUserDir());
  fs.mkdirSync(targetDir, { recursive: true });

  // Validate manifest
  const manifest = showSnapshot(archivePath);
  if (!manifest || manifest.version !== 1) {
    throw new Error("Invalid snapshot: missing or incompatible manifest");
  }

  // Preserve existing .vault-key files before restore
  const vaultKeys: Map<string, Buffer> = new Map();
  const userDir = path.join(targetDir, "user");
  if (fs.existsSync(userDir)) {
    const personasDir = path.join(userDir, "personas");
    try {
      const personas = fs.readdirSync(personasDir, { withFileTypes: true })
        .filter((d) => d.isDirectory());
      for (const p of personas) {
        const keyPath = path.join(personasDir, p.name, ".vault-key");
        try {
          vaultKeys.set(keyPath, fs.readFileSync(keyPath));
        } catch { /* no key */ }
      }
    } catch { /* no personas dir */ }
  }

  // Extract
  execSync(`tar xzf "${archivePath}" -C "${targetDir}"`, { stdio: "pipe" });

  // Restore .vault-key files
  for (const [keyPath, content] of vaultKeys) {
    fs.writeFileSync(keyPath, content, { mode: 0o600 });
  }
}

/**
 * List available snapshots in user/snapshots/
 */
export function listSnapshots(): string[] {
  const snapshotsDir = path.join(getUserDir(), "snapshots");
  try {
    return fs.readdirSync(snapshotsDir)
      .filter((f) => f.endsWith(".tar.gz"))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Read manifest from a snapshot archive without extracting.
 */
export function showSnapshot(archivePath: string): SnapshotManifest | null {
  try {
    const raw = execSync(
      `tar xzf "${archivePath}" -O user/snapshot.json 2>/dev/null || true`,
      { encoding: "utf8", stdio: "pipe" },
    );
    if (!raw.trim()) return null;
    return JSON.parse(raw.trim()) as SnapshotManifest;
  } catch {
    return null;
  }
}
