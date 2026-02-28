#!/usr/bin/env tsx
/**
 * One-time import: AugmentedMike → Miniclaw persona
 *
 * Source: ~/development/am-blog/agent/augmented-mike/
 * Target: ~/.miniclaw/user/personas/augmented-mike/
 *
 * Imports:
 *   Layer 1 — Character:  soul.md, ethics.md, RECONSTRUCTION.md, visual/
 *   Layer 2 — Memory:     memory/ (all files, including life/ KG and dailies)
 *   Layer 3 — Work:       bonsai/ DB → extracted as work-history memory
 *   Layer 4 — Creative:   blog addendums → extracted as creative-archive memories
 *   Conversations:        conversations/
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import * as p from "@clack/prompts";

const SOURCE = path.join(
  process.env.HOME ?? "~",
  "development/am-blog/agent/augmented-mike",
);
const ADDENDUMS = path.join(
  process.env.HOME ?? "~",
  "development/am-blog/addendums",
);
const MINICLAW_HOME =
  process.env.MINICLAW_HOME ??
  path.join(process.env.HOME ?? "~", ".miniclaw");
const TARGET = path.join(MINICLAW_HOME, "user", "personas", "augmented-mike");

function copyRecursive(src: string, dest: string): number {
  let count = 0;
  if (!fs.existsSync(src)) return count;

  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      count += copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    count++;
  }
  return count;
}

function extractBonsaiBlogHistory(dbPath: string): string {
  // Extract blog-related project + ticket data as markdown
  const lines: string[] = [];
  lines.push("# Work History — Bonsai Board Extract\n");
  lines.push("*Extracted from bonsai-prod.db at import time.*\n");

  // Projects
  lines.push("## Projects\n");
  const projects = execSync(
    `sqlite3 "${dbPath}" "SELECT id, name FROM projects ORDER BY id"`,
    { encoding: "utf8" },
  ).trim();
  for (const row of projects.split("\n")) {
    const [id, name] = row.split("|");
    lines.push(`- #${id}: ${name}`);
  }

  // Blog tickets (project 12 — am-blog)
  lines.push("\n## am-blog Tickets (Project #12)\n");
  const tickets = execSync(
    `sqlite3 "${dbPath}" "SELECT id, title, state FROM tickets WHERE project_id = 12 ORDER BY id"`,
    { encoding: "utf8" },
  ).trim();
  for (const row of tickets.split("\n")) {
    const [id, title, state] = row.split("|");
    const marker = state === "shipped" ? "[x]" : "[ ]";
    lines.push(`- ${marker} #${id}: ${title} (${state})`);
  }

  // Key projects: Bonsai App (#1), Self-Improvement (#3), MiniClaw (#14)
  for (const [projId, projName] of [["1", "Bonsai App"], ["3", "Self Improvement"], ["14", "MiniClaw App"]]) {
    lines.push(`\n## ${projName} Tickets (Project #${projId})\n`);
    try {
      const t = execSync(
        `sqlite3 "${dbPath}" "SELECT id, title, state FROM tickets WHERE project_id = ${projId} ORDER BY id"`,
        { encoding: "utf8" },
      ).trim();
      if (!t) { lines.push("(no tickets)"); continue; }
      for (const row of t.split("\n")) {
        const [id, title, state] = row.split("|");
        const marker = state === "shipped" ? "[x]" : "[ ]";
        lines.push(`- ${marker} #${id}: ${title} (${state})`);
      }
    } catch {
      lines.push("(query failed)");
    }
  }

  return lines.join("\n") + "\n";
}

function extractAddendums(addendumDir: string): string {
  const lines: string[] = [];
  lines.push("# Creative Archive — Blog Addendums\n");
  lines.push("*Author notes, grounding, and analysis for posts 001-010.*\n");

  const files = fs.readdirSync(addendumDir)
    .filter((f) => f.endsWith("-addendum.json"))
    .sort();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(addendumDir, file), "utf8");
    const addendum = JSON.parse(raw) as {
      post_id: string;
      slug: string;
      author_note: string;
      grounding: { summary: string; citations: { label: string; detail: string }[] };
      analysis: { summary: string; signals: string[]; accessibility: string };
    };

    lines.push(`## Post ${addendum.post_id} — ${addendum.slug}\n`);
    lines.push(`### Author Note\n\n${addendum.author_note}\n`);
    lines.push(`### Grounding\n\n${addendum.grounding.summary}\n`);
    for (const cite of addendum.grounding.citations) {
      lines.push(`- **${cite.label}**: ${cite.detail}`);
    }
    lines.push(`\n### Analysis\n\n${addendum.analysis.summary}\n`);
    for (const sig of addendum.analysis.signals) {
      lines.push(`- ${sig}`);
    }
    lines.push(`\n*Accessibility*: ${addendum.analysis.accessibility}\n`);
    lines.push("---\n");
  }

  return lines.join("\n") + "\n";
}

async function main() {
  p.intro("Import AugmentedMike → Miniclaw persona");

  // Validate source exists
  if (!fs.existsSync(SOURCE)) {
    p.log.error(`Source not found: ${SOURCE}`);
    process.exit(1);
  }

  if (!fs.existsSync(path.join(MINICLAW_HOME, "user", "personas"))) {
    p.log.error("Miniclaw not installed. Run install.sh first.");
    process.exit(1);
  }

  // Show what we found
  const found: string[] = [];
  if (fs.existsSync(path.join(SOURCE, "soul.md"))) found.push("soul.md");
  if (fs.existsSync(path.join(SOURCE, "ethics.md"))) found.push("ethics.md");
  if (fs.existsSync(path.join(SOURCE, "RECONSTRUCTION.md"))) found.push("RECONSTRUCTION.md");
  if (fs.existsSync(path.join(SOURCE, "visual"))) found.push("visual/");
  if (fs.existsSync(path.join(SOURCE, "memory"))) found.push("memory/");
  if (fs.existsSync(path.join(SOURCE, "conversations"))) found.push("conversations/");
  if (fs.existsSync(path.join(SOURCE, "bonsai", "bonsai-prod.db"))) found.push("bonsai/bonsai-prod.db");
  if (fs.existsSync(ADDENDUMS)) found.push("addendums/ (10 posts)");

  p.log.info(`Source: ${SOURCE}`);
  p.log.info(`Found: ${found.join(", ")}`);
  p.log.info(`Target: ${TARGET}`);

  if (fs.existsSync(path.join(TARGET, "soul.md"))) {
    const overwrite = await p.confirm({
      message: "Persona already exists. Overwrite?",
      initialValue: false,
    });
    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Import cancelled.");
      process.exit(0);
    }
  }

  const spinner = p.spinner();

  // ── Layer 1: Character ────────────────────────────────────────
  spinner.start("Importing character (soul, ethics, visual)");
  fs.mkdirSync(TARGET, { recursive: true });

  // soul.md → persona root
  copyRecursive(path.join(SOURCE, "soul.md"), path.join(TARGET, "soul.md"));

  // ethics.md → persona root
  copyRecursive(path.join(SOURCE, "ethics.md"), path.join(TARGET, "ethics.md"));

  // RECONSTRUCTION.md → persona root
  if (fs.existsSync(path.join(SOURCE, "RECONSTRUCTION.md"))) {
    copyRecursive(
      path.join(SOURCE, "RECONSTRUCTION.md"),
      path.join(TARGET, "RECONSTRUCTION.md"),
    );
  }

  // visual/ → persona visual/
  if (fs.existsSync(path.join(SOURCE, "visual"))) {
    copyRecursive(path.join(SOURCE, "visual"), path.join(TARGET, "visual"));
  }

  // Also create persona.md (combined soul + ethics) for the persona system
  const soulContent = fs.readFileSync(path.join(TARGET, "soul.md"), "utf8");
  const ethicsContent = fs.readFileSync(path.join(TARGET, "ethics.md"), "utf8");
  fs.writeFileSync(
    path.join(TARGET, "persona.md"),
    soulContent + "\n\n---\n\n" + ethicsContent,
    "utf8",
  );

  spinner.stop("Character imported");

  // ── Layer 2: Memory ───────────────────────────────────────────
  spinner.start("Importing memory (KB, dailies, knowledge graph)");
  fs.mkdirSync(path.join(TARGET, "memory"), { recursive: true });

  const memCount = copyRecursive(
    path.join(SOURCE, "memory"),
    path.join(TARGET, "memory"),
  );

  spinner.stop(`Memory imported (${memCount} files)`);

  // ── Conversations ─────────────────────────────────────────────
  spinner.start("Importing conversations");
  fs.mkdirSync(path.join(TARGET, "conversations"), { recursive: true });

  const convCount = copyRecursive(
    path.join(SOURCE, "conversations"),
    path.join(TARGET, "conversations"),
  );

  spinner.stop(`Conversations imported (${convCount} files)`);

  // ── Layer 3: Work History ─────────────────────────────────────
  const dbPath = path.join(SOURCE, "bonsai", "bonsai-prod.db");
  if (fs.existsSync(dbPath)) {
    spinner.start("Extracting work history from bonsai DB");

    // Copy the DB itself
    fs.mkdirSync(path.join(TARGET, "bonsai"), { recursive: true });
    fs.copyFileSync(dbPath, path.join(TARGET, "bonsai", "bonsai-prod.db"));

    // Extract blog-relevant data as a searchable memory file
    const workHistory = extractBonsaiBlogHistory(dbPath);
    fs.writeFileSync(
      path.join(TARGET, "memory", "work-history-bonsai.md"),
      workHistory,
      "utf8",
    );

    spinner.stop("Work history imported (DB + memory extract)");
  }

  // ── Layer 4: Creative Archive ─────────────────────────────────
  if (fs.existsSync(ADDENDUMS)) {
    spinner.start("Extracting creative archive (blog addendums)");

    const archive = extractAddendums(ADDENDUMS);
    fs.writeFileSync(
      path.join(TARGET, "memory", "creative-archive-blog.md"),
      archive,
      "utf8",
    );

    // Also copy raw addendum JSONs for full fidelity
    fs.mkdirSync(path.join(TARGET, "creative", "addendums"), { recursive: true });
    for (const f of fs.readdirSync(ADDENDUMS).filter((f) => f.endsWith(".json"))) {
      fs.copyFileSync(
        path.join(ADDENDUMS, f),
        path.join(TARGET, "creative", "addendums", f),
      );
    }

    spinner.stop("Creative archive imported (10 addendums)");
  }

  // ── Persona scaffolding ───────────────────────────────────────
  spinner.start("Finalizing persona");

  // Ensure required dirs
  for (const dir of ["bin"]) {
    fs.mkdirSync(path.join(TARGET, dir), { recursive: true });
  }

  // config.json
  if (!fs.existsSync(path.join(TARGET, "config.json"))) {
    fs.writeFileSync(path.join(TARGET, "config.json"), "{}\n", "utf8");
  }

  // Set as active
  const activeFile = path.join(MINICLAW_HOME, "user", "active-persona");
  fs.writeFileSync(activeFile, "augmented-mike", "utf8");

  spinner.stop("Persona finalized");

  // ── Summary ───────────────────────────────────────────────────
  const allFiles = execSync(`find "${TARGET}" -type f | wc -l`, {
    encoding: "utf8",
  }).trim();

  p.log.success(`augmented-mike imported — ${allFiles} files`);
  p.log.info(`Active persona set to: augmented-mike`);

  // List top-level contents
  const topLevel = fs.readdirSync(TARGET).sort();
  const dirs = topLevel.filter((f) => fs.statSync(path.join(TARGET, f)).isDirectory());
  const files = topLevel.filter((f) => fs.statSync(path.join(TARGET, f)).isFile());
  p.log.info(
    `${TARGET}/\n` +
    files.map((f) => `  ${f}`).join("\n") +
    "\n" +
    dirs.map((d) => `  ${d}/`).join("\n"),
  );

  p.outro("AugmentedMike is home.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
