/**
 * Kanban CLI — agent task board management.
 *
 * Usage:
 *   npx tsx src/kanban-cli.ts add <title> [flags]
 *   npx tsx src/kanban-cli.ts list [state]
 *   npx tsx src/kanban-cli.ts board
 *   npx tsx src/kanban-cli.ts show <id>
 *   npx tsx src/kanban-cli.ts move <id> <state>
 *   npx tsx src/kanban-cli.ts edit <id> [flags]
 *   npx tsx src/kanban-cli.ts note <id> <text>
 *   npx tsx src/kanban-cli.ts history <id>
 *   npx tsx src/kanban-cli.ts search <query>
 *   npx tsx src/kanban-cli.ts archive [days]
 *
 * States: backlog, in-progress, in-review, shipped
 * Types: chore, bugfix, feature, epic, research
 */

import {
  addTask,
  listTasks,
  moveTask,
  getTask,
  editTask,
  appendNote,
  fillSection,
  logCommit,
  unarchiveTask,
  taskHistory,
  searchTasks,
  boardSummary,
  archiveShipped,
  getChildren,
  checkTransitionGates,
  initBoard,
  isValidState,
  isValidPriority,
  isValidType,
  isValidSize,
  isValidStatus,
  STATES,
  TYPES,
  SIZES,
  REQUIRED_SECTIONS,
  type KanbanState,
  type Priority,
  type TaskType,
  type TaskSize,
  type TaskStatus,
  type KanbanTask,
} from "./kanban.js";

function usage(): never {
  console.log(`
Kanban — agent task board

Commands:
  add <title> [flags]        Add a task to backlog
    --project <name>         Project name (default: default)
    --type <t>               chore|bugfix|feature|epic|research (default: chore)
    --priority <p>           low|medium|high|critical (default: medium)
    --size <s>               small|medium|large|xl (default: medium)
    --due <ISO date>         Due date
    --parent <id>            Parent epic ID
    --blocked-by <id,id>     Comma-separated blocking task IDs
  list [state]               List tasks (optional state filter)
  board                      Summary view: counts + active + blocked + due
  show <id>                  Full task detail
  move <id> <state>          Transition task (enforces state machine + gates)
  check <id> <state>         Check gate readiness for a transition
  edit <id> [flags]          Edit task fields
    --title <title>          New title
    --project <name>         New project
    --type <t>               New type
    --priority <p>           New priority
    --status <s>             active|on-hold
    --size <s>               New size
    --due <date>             New due date (use "null" to clear)
    --parent <id>            New parent (use "null" to clear)
    --blocked-by <ids>       New blocked-by list (replaces existing)
  note <id> <text>           Append a note to task body
  fill <id> <section> <text> Fill a structured section (replaces existing content)
    section: problem | research | implementation | acceptance
             (or the full heading text, e.g. "Problem / Work Summary")
  commit <id> <hash> <msg>   Log a git commit or PR against the task
    hash: short/full commit SHA or "pr:123" for PRs
    msg:  commit message / PR title
  history <id>               Show transition log
  search <query>             Search tasks by title/body/project/type
  archive [days]             Archive shipped tasks older than N days (default: 7)
  unarchive <id>             Move an archived task back to backlog

States: ${STATES.join(", ")}
Types: ${TYPES.join(", ")}
`.trim());
  process.exit(1);
}

function extractFlag(args: string[], flag: string): { value: string | undefined; rest: string[] } {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return { value: undefined, rest: args };
  const value = args[idx + 1]!;
  const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { value, rest };
}

function formatTask(t: KanbanTask): string {
  const flags: string[] = [];
  if (t.priority !== "medium") flags.push(t.priority);
  if (t.status !== "active") flags.push(t.status);
  if (t.due) flags.push(`due:${t.due}`);
  const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
  return `  #${String(t.id).padStart(3, "0")} ${t.title} (${t.type}, ${t.size})${flagStr}`;
}

function handleAdd(args: string[]): void {
  let remaining = args;
  const { value: project, rest: r1 } = extractFlag(remaining, "--project");
  remaining = r1;
  const { value: typeRaw, rest: r2 } = extractFlag(remaining, "--type");
  remaining = r2;
  const { value: priorityRaw, rest: r3 } = extractFlag(remaining, "--priority");
  remaining = r3;
  const { value: sizeRaw, rest: r4 } = extractFlag(remaining, "--size");
  remaining = r4;
  const { value: due, rest: r5 } = extractFlag(remaining, "--due");
  remaining = r5;
  const { value: parentRaw, rest: r6 } = extractFlag(remaining, "--parent");
  remaining = r6;
  const { value: blockedByRaw, rest: r7 } = extractFlag(remaining, "--blocked-by");
  remaining = r7;

  const title = remaining.join(" ");
  if (!title) usage();

  if (typeRaw && !isValidType(typeRaw)) {
    console.error(`Invalid type: ${typeRaw}. Must be: ${TYPES.join(", ")}`);
    process.exit(1);
  }
  if (priorityRaw && !isValidPriority(priorityRaw)) {
    console.error(`Invalid priority: ${priorityRaw}. Must be: low, medium, high, critical`);
    process.exit(1);
  }
  if (sizeRaw && !isValidSize(sizeRaw)) {
    console.error(`Invalid size: ${sizeRaw}. Must be: ${SIZES.join(", ")}`);
    process.exit(1);
  }

  const parent = parentRaw ? Number(parentRaw) : undefined;
  const blocked_by = blockedByRaw
    ? blockedByRaw.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
    : undefined;

  const task = addTask(title, {
    project,
    type: typeRaw as TaskType | undefined,
    priority: priorityRaw as Priority | undefined,
    size: sizeRaw as TaskSize | undefined,
    due,
    parent,
    blocked_by,
  });

  console.log(`Added #${task.id}: ${task.title} → backlog (${task.type}, ${task.priority}, ${task.size})`);
}

function handleList(args: string[]): void {
  const [stateArg] = args;

  if (stateArg && !isValidState(stateArg)) {
    console.error(`Invalid state: ${stateArg}. Must be: ${STATES.join(", ")}`);
    process.exit(1);
  }

  const state = stateArg as KanbanState | undefined;
  const tasks = listTasks(state);

  if (tasks.length === 0) {
    console.log(state ? `No tasks in ${state}.` : "Board is empty.");
    return;
  }

  if (state) {
    console.log(`${state} (${tasks.length}):`);
    for (const t of tasks) console.log(formatTask(t));
  } else {
    for (const s of STATES) {
      const group = tasks.filter((t) => t.state === s);
      if (group.length > 0) {
        console.log(`\n${s} (${group.length}):`);
        for (const t of group) console.log(formatTask(t));
      }
    }
  }
}

function handleBoard(): void {
  const { counts, active, blocked, due_soon } = boardSummary();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    console.log("Board is empty.");
    return;
  }

  console.log(`Backlog: ${counts["backlog"]} | In Progress: ${counts["in-progress"]} | In Review: ${counts["in-review"]} | Shipped: ${counts["shipped"]}`);

  if (active.length > 0) {
    console.log("\nActive:");
    for (const t of active) {
      const flag = t.status !== "active" ? ` [${t.status}]` : "";
      console.log(`  #${String(t.id).padStart(3, "0")} ${t.title}${flag}`);
    }
  }

  if (blocked.length > 0) {
    console.log("\nBlocked:");
    for (const t of blocked) {
      console.log(`  #${String(t.id).padStart(3, "0")} ${t.title} (by ${t.blocked_by.map((b) => "#" + b).join(", ")})`);
    }
  }

  if (due_soon.length > 0) {
    console.log("\nDue soon:");
    for (const t of due_soon) {
      console.log(`  #${String(t.id).padStart(3, "0")} ${t.title} (${t.due})`);
    }
  }
}

function handleShow(args: string[]): void {
  const [idStr] = args;
  if (!idStr) usage();

  const id = Number(idStr);
  if (Number.isNaN(id)) {
    console.error(`Invalid ID: ${idStr}`);
    process.exit(1);
  }

  const task = getTask(id);
  if (!task) {
    console.error(`Task #${id} not found.`);
    process.exit(1);
  }

  console.log(`#${task.id} ${task.title}`);
  console.log(`Project: ${task.project} | Type: ${task.type}`);
  console.log(`State: ${task.state} | Priority: ${task.priority} | Status: ${task.status}`);
  console.log(`Size: ${task.size}`);
  if (task.due) console.log(`Due: ${task.due}`);
  if (task.parent) console.log(`Epic: #${task.parent}`);
  if (task.blocked_by.length > 0) console.log(`Blocked by: ${task.blocked_by.map((b) => "#" + b).join(", ")}`);
  console.log(`Created: ${task.created}`);
  console.log(`Updated: ${task.updated}`);

  if (task.commits && task.commits.length > 0) {
    console.log("\nCommits:");
    for (const c of task.commits) {
      console.log(`  ${c.hash}  ${c.message}  (${c.at.slice(0, 10)})`);
    }
  }

  if (task.history.length > 0) {
    console.log("\nHistory:");
    for (const h of task.history) {
      console.log(`  ${h.from} → ${h.to}  ${h.at}`);
    }
  }

  if (task.body) {
    console.log(`\n---\n${task.body}`);
  }

  if (task.type === "epic") {
    const children = getChildren(id);
    if (children.length > 0) {
      console.log("\nChild tasks:");
      for (const c of children) console.log(formatTask(c));
    }
  }
}

function handleQueue(args: string[]): void {
  const [idStr] = args;
  if (!idStr) {
    console.error("Usage: queue <id>");
    process.exit(1);
  }
  const id = Number(idStr);
  if (Number.isNaN(id)) {
    console.error(`Invalid ID: ${idStr}`);
    process.exit(1);
  }
  try {
    const task = moveTask(id, "queued");
    console.log(`Queued #${task.id}: ${task.title} → queued`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function handleMove(args: string[]): void {
  const [idStr, toState] = args;
  if (!idStr || !toState) usage();

  const id = Number(idStr);
  if (Number.isNaN(id)) {
    console.error(`Invalid ID: ${idStr}`);
    process.exit(1);
  }

  if (!isValidState(toState)) {
    console.error(`Invalid state: ${toState}. Must be: ${STATES.join(", ")}`);
    process.exit(1);
  }

  try {
    const task = moveTask(id, toState);
    console.log(`Moved #${task.id} ${task.title} → ${toState}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function handleEdit(args: string[]): void {
  let remaining = args;
  const { value: title, rest: r1 } = extractFlag(remaining, "--title");
  remaining = r1;
  const { value: project, rest: r2 } = extractFlag(remaining, "--project");
  remaining = r2;
  const { value: typeRaw, rest: r3 } = extractFlag(remaining, "--type");
  remaining = r3;
  const { value: priorityRaw, rest: r4 } = extractFlag(remaining, "--priority");
  remaining = r4;
  const { value: statusRaw, rest: r5 } = extractFlag(remaining, "--status");
  remaining = r5;
  const { value: sizeRaw, rest: r6 } = extractFlag(remaining, "--size");
  remaining = r6;
  const { value: dueRaw, rest: r7 } = extractFlag(remaining, "--due");
  remaining = r7;
  const { value: parentRaw, rest: r8 } = extractFlag(remaining, "--parent");
  remaining = r8;
  const { value: blockedByRaw, rest: r9 } = extractFlag(remaining, "--blocked-by");
  remaining = r9;

  const [idStr] = remaining;
  if (!idStr) usage();

  const id = Number(idStr);
  if (Number.isNaN(id)) {
    console.error(`Invalid ID: ${idStr}`);
    process.exit(1);
  }

  if (typeRaw && !isValidType(typeRaw)) {
    console.error(`Invalid type: ${typeRaw}. Must be: ${TYPES.join(", ")}`);
    process.exit(1);
  }
  if (priorityRaw && !isValidPriority(priorityRaw)) {
    console.error(`Invalid priority: ${priorityRaw}. Must be: low, medium, high, critical`);
    process.exit(1);
  }
  if (statusRaw && !isValidStatus(statusRaw)) {
    console.error(`Invalid status: ${statusRaw}. Must be: active, on-hold`);
    process.exit(1);
  }
  if (sizeRaw && !isValidSize(sizeRaw)) {
    console.error(`Invalid size: ${sizeRaw}. Must be: ${SIZES.join(", ")}`);
    process.exit(1);
  }

  const due = dueRaw === "null" ? null : dueRaw;
  const parent = parentRaw === "null" ? null : parentRaw ? Number(parentRaw) : undefined;
  const blocked_by = blockedByRaw
    ? blockedByRaw.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
    : undefined;

  try {
    const task = editTask(id, {
      title,
      project,
      type: typeRaw as TaskType | undefined,
      priority: priorityRaw as Priority | undefined,
      status: statusRaw as TaskStatus | undefined,
      size: sizeRaw as TaskSize | undefined,
      due,
      parent,
      blocked_by,
    });
    console.log(`Updated #${task.id}: ${task.title} (${task.type}, ${task.priority}, ${task.size})`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function handleNote(args: string[]): void {
  const [idStr, ...noteParts] = args;
  if (!idStr || noteParts.length === 0) usage();

  const id = Number(idStr);
  if (Number.isNaN(id)) {
    console.error(`Invalid ID: ${idStr}`);
    process.exit(1);
  }

  const note = noteParts.join(" ");
  try {
    const task = appendNote(id, note);
    console.log(`Note added to #${task.id}: ${task.title}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// Short aliases → full heading text
const SECTION_ALIASES: Record<string, string> = {
  problem:        "Problem / Work Summary",
  research:       "Research Planning",
  implementation: "Implementation Plan",
  acceptance:     "Acceptance Criteria",
};

function handleFill(args: string[]): void {
  const [idStr, sectionKey, ...contentParts] = args;
  if (!idStr || !sectionKey || contentParts.length === 0) {
    console.error("Usage: fill <id> <section> <text>");
    console.error(`  section: ${Object.keys(SECTION_ALIASES).join(" | ")}`);
    console.error(`  (or the full heading, e.g. "Problem / Work Summary")`);
    process.exit(1);
  }

  const id = Number(idStr);
  if (Number.isNaN(id)) {
    console.error(`Invalid ID: ${idStr}`);
    process.exit(1);
  }

  const heading = SECTION_ALIASES[sectionKey.toLowerCase()] ?? sectionKey;
  const content = contentParts.join(" ");

  try {
    const task = fillSection(id, heading, content);
    console.log(`Section "${heading}" filled in #${task.id}: ${task.title}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function handleCommit(args: string[]): void {
  const [idStr, hash, ...msgParts] = args;
  if (!idStr || !hash || msgParts.length === 0) {
    console.error("Usage: commit <id> <hash> <message>");
    console.error("  hash: short SHA (abc1234) or pr:123 for pull requests");
    process.exit(1);
  }

  const id = Number(idStr);
  if (Number.isNaN(id)) {
    console.error(`Invalid ID: ${idStr}`);
    process.exit(1);
  }

  const message = msgParts.join(" ");
  try {
    const task = logCommit(id, hash, message);
    console.log(`Commit ${hash} logged on #${task.id}: ${task.title}`);
    console.log(`  "${message}"`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function handleHistory(args: string[]): void {
  const [idStr] = args;
  if (!idStr) usage();

  const id = Number(idStr);
  if (Number.isNaN(id)) {
    console.error(`Invalid ID: ${idStr}`);
    process.exit(1);
  }

  try {
    const history = taskHistory(id);
    if (history.length === 0) {
      console.log(`Task #${id} has no transitions yet.`);
      return;
    }
    for (const h of history) {
      console.log(`${h.from} → ${h.to}  ${h.at}`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function handleSearch(args: string[]): void {
  const query = args.join(" ");
  if (!query) usage();

  const results = searchTasks(query);
  if (results.length === 0) {
    console.log(`No tasks matching "${query}".`);
    return;
  }

  for (const t of results) {
    const flags: string[] = [];
    if (t.status !== "active") flags.push(t.status);
    if (t.due) flags.push(`due:${t.due}`);
    const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
    console.log(`#${String(t.id).padStart(3, "0")} ${t.title} (${t.state}, ${t.type}, ${t.priority})${flagStr}`);
  }
}

function handleUnarchive(args: string[]): void {
  const [idStr] = args;
  if (!idStr) {
    console.error("Usage: unarchive <id>");
    process.exit(1);
  }

  const id = Number(idStr);
  if (Number.isNaN(id)) {
    console.error(`Invalid ID: ${idStr}`);
    process.exit(1);
  }

  try {
    const task = unarchiveTask(id);
    console.log(`Unarchived #${task.id}: ${task.title} → backlog`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function handleArchive(args: string[]): void {
  const [daysStr] = args;
  const days = daysStr ? Number(daysStr) : 7;
  if (Number.isNaN(days) || days < 0) {
    console.error(`Invalid days: ${daysStr}`);
    process.exit(1);
  }

  const archived = archiveShipped(days);
  if (archived.length === 0) {
    console.log(`No shipped tasks older than ${days} days.`);
  } else {
    console.log(`Archived ${archived.length} task(s):`);
    for (const t of archived) {
      console.log(`  #${String(t.id).padStart(3, "0")} ${t.title}`);
    }
  }
}

function handleCheck(args: string[]): void {
  const [idStr, toState] = args;
  if (!idStr || !toState) usage();

  const id = Number(idStr);
  if (Number.isNaN(id)) {
    console.error(`Invalid ID: ${idStr}`);
    process.exit(1);
  }

  if (!isValidState(toState)) {
    console.error(`Invalid state: ${toState}. Must be: ${STATES.join(", ")}`);
    process.exit(1);
  }

  try {
    const result = checkTransitionGates(id, toState);
    if (result.ok) {
      console.log(`Task #${id} is ready to move to ${toState}`);
    } else {
      console.log(`Task #${id} is NOT ready to move to ${toState}:`);
      for (const v of result.violations) {
        console.log(`  - ${v.message}`);
      }
      process.exit(1);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function main(): void {
  const [command, ...args] = process.argv.slice(2);
  if (!command) usage();

  initBoard();

  switch (command) {
    case "add":     handleAdd(args); break;
    case "list":    handleList(args); break;
    case "board":   handleBoard(); break;
    case "show":    handleShow(args); break;
    case "queue":   handleQueue(args); break;
    case "move":    handleMove(args); break;
    case "check":   handleCheck(args); break;
    case "edit":    handleEdit(args); break;
    case "note":    handleNote(args); break;
    case "fill":    handleFill(args); break;
    case "commit":  handleCommit(args); break;
    case "history": handleHistory(args); break;
    case "search":  handleSearch(args); break;
    case "archive":   handleArchive(args); break;
    case "unarchive": handleUnarchive(args); break;
    default:        usage();
  }
}

main();
