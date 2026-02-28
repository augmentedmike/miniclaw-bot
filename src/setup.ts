import { execSync } from "node:child_process";
import { readCredentials, isExpired } from "./auth.js";
import { ensureMinicawDirs } from "./config.js";
import { ensureQmdCollection, indexMemory } from "./memory/search.js";

function checkNode(): void {
  const major = parseInt(process.versions.node.split(".")[0]!, 10);
  if (major < 18) {
    throw new Error(`Node >= 18 required (found ${process.versions.node}). Update Node.js.`);
  }
  console.log(`  Node ${process.versions.node}`);
}

function checkQmd(): void {
  try {
    const version = execSync("qmd --version", { encoding: "utf8", stdio: "pipe" }).trim();
    console.log(`  qmd ${version}`);
  } catch {
    throw new Error(
      "qmd is not installed. Install it with:\n" +
      "  npm install -g @tobilu/qmd\n" +
      "See https://github.com/tobi/qmd for details.",
    );
  }
}

function checkClaude(): void {
  const cred = readCredentials();
  if (!cred) {
    throw new Error(
      "No Claude CLI credentials found. Sign in first:\n" +
      "  claude login",
    );
  }
  if (isExpired(cred)) {
    throw new Error(
      "Claude CLI token expired. Re-authenticate:\n" +
      "  claude login",
    );
  }
  console.log("  Claude credentials valid");
}

function setupDirectories(): void {
  ensureMinicawDirs();
  console.log("  Directories ready");
}

function setupQmdCollection(): void {
  ensureQmdCollection();
  indexMemory();
  console.log("  qmd collection indexed");
}

export async function runSetup(): Promise<void> {
  console.log("miniclaw setup\n");

  const checks: [string, () => void][] = [
    ["Checking Node.js...", checkNode],
    ["Checking qmd...", checkQmd],
    ["Checking Claude credentials...", checkClaude],
    ["Setting up directories...", setupDirectories],
    ["Setting up qmd collection...", setupQmdCollection],
  ];

  for (const [label, fn] of checks) {
    console.log(label);
    try {
      fn();
    } catch (err) {
      console.error(`\nFailed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }

  console.log("\nSetup complete.");
}
