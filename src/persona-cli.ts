/**
 * Persona CLI — manage agent identities.
 *
 * Usage:
 *   miniclaw-persona create <name>      Create from template (or --from <other>)
 *   miniclaw-persona list               List all (* marks active)
 *   miniclaw-persona show [name]        Display persona (default: active)
 *   miniclaw-persona select <name>      Set active persona
 *   miniclaw-persona edit <name>        Open in $EDITOR
 *   miniclaw-persona delete <name>      Delete (refuses active)
 *   miniclaw-persona active             Print active name
 *   miniclaw-persona import <file>      Import persona.md from external path
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  ensureMinicawDirs,
  ensurePersonaDirs,
  getUserDir,
  getSystemDir,
  writeActivePersona,
  loadConfig,
} from "./config.js";
import { loadPersona, listPersonas, savePersona, parsePersona } from "./persona.js";

function usage(): never {
  console.log(`
Persona — manage agent identities

Commands:
  create <name>       Create persona from template (--from <other> to clone)
  list                List all personas (* marks active)
  show [name]         Display persona content (default: active)
  select <name>       Set active persona
  edit <name>         Open persona.md in $EDITOR
  delete <name>       Delete persona (refuses if active)
  active              Print active persona name
  import <file>       Import persona.md from external path
`.trim());
  process.exit(1);
}

function getActiveName(): string {
  const config = loadConfig();
  return config.activePersona ?? "default";
}

function handleCreate(args: string[]): void {
  let name = "";
  let fromName = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) {
      fromName = args[i + 1]!;
      i++;
    } else if (!name) {
      name = args[i]!;
    }
  }

  if (!name) usage();

  const personaDir = path.join(getUserDir(), "personas", name);
  if (fs.existsSync(path.join(personaDir, "persona.md"))) {
    console.error(`Persona "${name}" already exists.`);
    process.exit(1);
  }

  ensurePersonaDirs(name);

  if (fromName) {
    const source = loadPersona(fromName);
    if (!source) {
      console.error(`Source persona "${fromName}" not found.`);
      process.exit(1);
    }
    const cloned = { ...source, name };
    savePersona(cloned);
    console.log(`Created persona "${name}" (cloned from "${fromName}")`);
  } else {
    // Copy template
    const templatePath = path.join(getSystemDir(), "templates", "persona.md");
    let template: string;
    try {
      template = fs.readFileSync(templatePath, "utf8");
    } catch {
      // Fallback inline template
      template = `# ${name}\n\n## Identity\n\n(Describe who this agent is.)\n\n## Personality\n\n(Describe personality traits.)\n\n## Voice\n\n(Describe communication style.)\n\n## Values\n\n(Core values and principles.)\n`;
    }
    template = template.replace(/^# .+$/m, `# ${name}`);
    fs.writeFileSync(path.join(personaDir, "persona.md"), template, "utf8");
    console.log(`Created persona "${name}" from template`);
  }

  // Write default persona config
  if (!fs.existsSync(path.join(personaDir, "config.json"))) {
    fs.writeFileSync(path.join(personaDir, "config.json"), "{}\n", "utf8");
  }
}

function handleList(): void {
  const names = listPersonas();
  const active = getActiveName();

  if (names.length === 0) {
    console.log("No personas found.");
    return;
  }

  for (const name of names) {
    const marker = name === active ? " *" : "";
    console.log(`  ${name}${marker}`);
  }
}

function handleShow(args: string[]): void {
  const name = args[0] ?? getActiveName();
  const persona = loadPersona(name);
  if (!persona) {
    console.error(`Persona "${name}" not found.`);
    process.exit(1);
  }
  console.log(persona.raw);
}

function handleSelect(args: string[]): void {
  const name = args[0];
  if (!name) usage();

  const persona = loadPersona(name);
  if (!persona) {
    console.error(`Persona "${name}" not found.`);
    process.exit(1);
  }

  writeActivePersona(name);
  console.log(`Active persona: ${name}`);
}

function handleEdit(args: string[]): void {
  const name = args[0] ?? getActiveName();
  const personaPath = path.join(getUserDir(), "personas", name, "persona.md");

  if (!fs.existsSync(personaPath)) {
    console.error(`Persona "${name}" not found.`);
    process.exit(1);
  }

  const editor = process.env.EDITOR ?? "vi";
  execSync(`${editor} "${personaPath}"`, { stdio: "inherit" });
}

function handleDelete(args: string[]): void {
  const name = args[0];
  if (!name) usage();

  const active = getActiveName();
  if (name === active) {
    console.error(`Cannot delete the active persona "${name}". Switch first.`);
    process.exit(1);
  }

  const personaDir = path.join(getUserDir(), "personas", name);
  if (!fs.existsSync(personaDir)) {
    console.error(`Persona "${name}" not found.`);
    process.exit(1);
  }

  fs.rmSync(personaDir, { recursive: true });
  console.log(`Deleted persona "${name}"`);
}

function handleActive(): void {
  console.log(getActiveName());
}

function handleImport(args: string[]): void {
  const filePath = args[0];
  if (!filePath) usage();

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf8");

  // Derive name from H1 or filename
  const h1Match = content.match(/^#\s+(.+)$/m);
  const name = h1Match
    ? h1Match[1]!.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : path.basename(filePath, path.extname(filePath));

  ensurePersonaDirs(name);
  const persona = parsePersona(name, content);
  savePersona(persona);

  if (!fs.existsSync(path.join(getUserDir(), "personas", name, "config.json"))) {
    fs.writeFileSync(path.join(getUserDir(), "personas", name, "config.json"), "{}\n", "utf8");
  }

  console.log(`Imported persona "${name}"`);
}

async function main() {
  ensureMinicawDirs();

  const [command, ...args] = process.argv.slice(2);
  if (!command) usage();

  switch (command) {
    case "create":  handleCreate(args); break;
    case "list":    handleList(); break;
    case "show":    handleShow(args); break;
    case "select":  handleSelect(args); break;
    case "edit":    handleEdit(args); break;
    case "delete":  handleDelete(args); break;
    case "active":  handleActive(); break;
    case "import":  handleImport(args); break;
    default:        usage();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
