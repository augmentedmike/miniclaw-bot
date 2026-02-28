/**
 * Snapshot CLI — export/restore agent state.
 *
 * Usage:
 *   miniclaw-snapshot export [name]     Export current state
 *   miniclaw-snapshot restore <file>    Restore from archive
 *   miniclaw-snapshot list              List available snapshots
 *   miniclaw-snapshot show <file>       Show manifest
 *   miniclaw-snapshot clone             (stub)
 *   miniclaw-snapshot diff              (stub)
 */

import fs from "node:fs";
import path from "node:path";
import { ensureMinicawDirs, getUserDir } from "./config.js";
import { exportSnapshot, restoreSnapshot, listSnapshots, showSnapshot } from "./snapshot.js";

function usage(): never {
  console.log(`
Snapshot — export/restore agent state

Commands:
  export [name]       Export current state as .tar.gz
  restore <file>      Restore from snapshot archive
  list                List available snapshots
  show <file>         Show snapshot manifest
  clone               (coming soon)
  diff                (coming soon)

Options:
  --dir <path>        Target directory for restore (default: ~/.miniclaw)
`.trim());
  process.exit(1);
}

function handleExport(args: string[]): void {
  const name = args[0];
  const archivePath = exportSnapshot(name);
  console.log(`Snapshot exported: ${archivePath}`);
}

function handleRestore(args: string[]): void {
  let file = "";
  let targetDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && args[i + 1]) {
      targetDir = args[i + 1]!;
      i++;
    } else if (!file) {
      file = args[i]!;
    }
  }

  if (!file) usage();

  // Resolve relative paths and check snapshots dir
  let archivePath = file;
  if (!path.isAbsolute(archivePath)) {
    // Try snapshots dir first
    const snapshotsDirPath = path.join(getUserDir(), "snapshots", archivePath);
    const cwdPath = path.resolve(archivePath);
    archivePath = fs.existsSync(snapshotsDirPath) ? snapshotsDirPath : cwdPath;
  }

  restoreSnapshot(archivePath, { targetDir });
  console.log(`Snapshot restored from: ${archivePath}`);
}

function handleList(): void {
  const snapshots = listSnapshots();
  if (snapshots.length === 0) {
    console.log("No snapshots found.");
    return;
  }
  for (const s of snapshots) {
    console.log(`  ${s}`);
  }
}

function handleShow(args: string[]): void {
  const file = args[0];
  if (!file) usage();

  let archivePath = file;
  if (!path.isAbsolute(archivePath)) {
    const snapshotsDirPath = path.join(getUserDir(), "snapshots", archivePath);
    const cwdPath = path.resolve(archivePath);
    archivePath = fs.existsSync(snapshotsDirPath) ? snapshotsDirPath : cwdPath;
  }

  const manifest = showSnapshot(archivePath);
  if (!manifest) {
    console.error("Could not read snapshot manifest.");
    process.exit(1);
  }

  console.log(`Name:      ${manifest.name}`);
  console.log(`Version:   ${manifest.version}`);
  console.log(`Timestamp: ${manifest.timestamp}`);
  console.log(`Persona:   ${manifest.activePersona ?? "(none)"}`);
  console.log(`Components:`);
  for (const [key, val] of Object.entries(manifest.components)) {
    console.log(`  ${key}: ${val ? "yes" : "no"}`);
  }
}

function handleStub(name: string): void {
  console.log(`${name} — coming soon.`);
  process.exit(0);
}

async function main() {
  ensureMinicawDirs();

  const [command, ...args] = process.argv.slice(2);
  if (!command) usage();

  switch (command) {
    case "export":  handleExport(args); break;
    case "restore": handleRestore(args); break;
    case "list":    handleList(); break;
    case "show":    handleShow(args); break;
    case "clone":   handleStub("clone"); break;
    case "diff":    handleStub("diff"); break;
    default:        usage();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
