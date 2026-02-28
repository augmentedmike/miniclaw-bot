/**
 * Interactive Miniclaw installer TUI.
 * Called by install.sh after system files are in place.
 * Walks the user through creating their first persona.
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { ensurePersonaDirs, getUserDir, getSystemDir, writeActivePersona } from "./config.js";
import { initVaultKey } from "./vault.js";

const INSTALL_DIR = process.env.MINICLAW_HOME
  ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? "~", ".miniclaw");

function hasExistingPersonas(): boolean {
  const personasDir = path.join(INSTALL_DIR, "user", "personas");
  try {
    const dirs = fs.readdirSync(personasDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "default");
    return dirs.length > 0;
  } catch {
    return false;
  }
}

function findLegacyFiles(): { soul: boolean; ethics: boolean } {
  return {
    soul: fs.existsSync(path.join(INSTALL_DIR, "soul.md")),
    ethics: fs.existsSync(path.join(INSTALL_DIR, "ethics.md")),
  };
}

async function main() {
  // Skip TUI if personas already exist (re-install / upgrade)
  if (hasExistingPersonas()) {
    return;
  }

  // Skip if not interactive
  if (!process.stdin.isTTY) {
    return;
  }

  p.intro("Miniclaw — Create your agent");

  const name = await p.text({
    message: "What's your agent's name?",
    placeholder: "augmented-mike",
    validate: (val) => {
      if (!val.trim()) return "Name is required";
    },
  });

  if (p.isCancel(name)) {
    p.cancel("Setup cancelled. You can run 'miniclaw-persona create <name>' later.");
    process.exit(0);
  }

  // Normalize: lowercase, replace spaces/special chars with hyphens, collapse
  const agentName = (name as string)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "agent";

  // Check for legacy soul.md / ethics.md
  const legacy = findLegacyFiles();
  let importLegacy = false;

  if (legacy.soul || legacy.ethics) {
    const found = [legacy.soul && "soul.md", legacy.ethics && "ethics.md"].filter(Boolean).join(" and ");

    const importChoice = await p.confirm({
      message: `Found ${found} — import as identity files?`,
      initialValue: true,
    });

    if (p.isCancel(importChoice)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    importLegacy = importChoice as boolean;
  }

  // Vault init
  const initVault = await p.confirm({
    message: "Initialize vault encryption?",
    initialValue: true,
  });

  if (p.isCancel(initVault)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  // ── Create persona ──────────────────────────────────────────────
  const spinner = p.spinner();
  spinner.start("Creating persona");

  const personaDir = ensurePersonaDirs(agentName);

  if (importLegacy) {
    // Copy legacy files into persona dir
    if (legacy.soul) {
      fs.copyFileSync(
        path.join(INSTALL_DIR, "soul.md"),
        path.join(personaDir, "soul.md"),
      );
    }
    if (legacy.ethics) {
      fs.copyFileSync(
        path.join(INSTALL_DIR, "ethics.md"),
        path.join(personaDir, "ethics.md"),
      );
    }

    // Also copy as persona.md (combined) for the persona system
    const parts: string[] = [];
    if (legacy.soul) {
      parts.push(fs.readFileSync(path.join(INSTALL_DIR, "soul.md"), "utf8"));
    }
    if (legacy.ethics) {
      parts.push(fs.readFileSync(path.join(INSTALL_DIR, "ethics.md"), "utf8"));
    }
    fs.writeFileSync(
      path.join(personaDir, "persona.md"),
      parts.join("\n\n---\n\n"),
      "utf8",
    );
  } else {
    // Copy template
    const templatePath = path.join(getSystemDir(), "templates", "persona.md");
    let template: string;
    try {
      template = fs.readFileSync(templatePath, "utf8");
    } catch {
      template = `# ${agentName}\n\n## Identity\n\n(Describe who this agent is.)\n`;
    }
    template = template.replace(/^# .+$/m, `# ${agentName}`);
    fs.writeFileSync(path.join(personaDir, "persona.md"), template, "utf8");
  }

  // Write persona config
  if (!fs.existsSync(path.join(personaDir, "config.json"))) {
    fs.writeFileSync(path.join(personaDir, "config.json"), "{}\n", "utf8");
  }

  // Set as active
  writeActivePersona(agentName);

  spinner.stop(`Persona "${agentName}" created`);

  // ── Vault init ────────────────────────────────────────────────
  if (initVault as boolean) {
    const vaultSpinner = p.spinner();
    vaultSpinner.start("Initializing vault");

    // Ensure vault key goes in the persona dir
    process.env.MINICLAW_HOME = INSTALL_DIR;
    const key = initVaultKey();

    vaultSpinner.stop("Vault initialized");
    p.log.info(`Key (first 8 chars): ${key.slice(0, 8)}...`);
  }

  // ── Summary ───────────────────────────────────────────────────
  p.log.success(`Active persona: ${agentName}`);

  const personaFiles = fs.readdirSync(personaDir);
  const personaDirs = personaFiles.filter((f) =>
    fs.statSync(path.join(personaDir, f)).isDirectory(),
  );
  const personaRegFiles = personaFiles.filter((f) =>
    fs.statSync(path.join(personaDir, f)).isFile(),
  );

  p.log.info(
    `${personaDir}\n` +
    personaRegFiles.map((f) => `  ${f}`).join("\n") +
    (personaDirs.length > 0 ? "\n" + personaDirs.map((d) => `  ${d}/`).join("\n") : ""),
  );

  p.outro("Ready. Run 'miniclaw --help' to get started.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
