import { z } from "zod";
import { tool } from "ai";
import {
  addTask,
  listTasks,
  moveTask,
  getTask,
  editTask,
  appendNote,
  searchTasks,
  getChildren,
  checkTransitionGates,
  isValidState,
  isValidType,
  isValidPriority,
  isValidSize,
  isValidStatus,
  type KanbanState,
  type KanbanTask,
} from "../kanban.js";

function formatTask(t: KanbanTask): string {
  const flags: string[] = [];
  if (t.status !== "active") flags.push(t.status);
  if (t.due) flags.push(`due:${t.due}`);
  if (t.parent) flags.push(`epic:#${t.parent}`);
  const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
  return `#${t.id} ${t.title} (${t.state}, ${t.type}, ${t.priority}, ${t.size})${flagStr}`;
}

function formatTaskDetail(t: KanbanTask): string {
  const lines: string[] = [
    `# #${t.id} ${t.title}`,
    `Project: ${t.project} | Type: ${t.type} | State: ${t.state}`,
    `Priority: ${t.priority} | Size: ${t.size} | Status: ${t.status}`,
  ];
  if (t.due) lines.push(`Due: ${t.due}`);
  if (t.parent) lines.push(`Epic: #${t.parent}`);
  if (t.blocked_by.length > 0) lines.push(`Blocked by: ${t.blocked_by.map((b) => "#" + b).join(", ")}`);
  lines.push(`Created: ${t.created}`);
  lines.push(`Updated: ${t.updated}`);

  if (t.history.length > 0) {
    lines.push("", "History:");
    for (const h of t.history) {
      lines.push(`  ${h.from} → ${h.to} at ${h.at}`);
    }
  }

  if (t.body) lines.push("", "---", t.body);
  return lines.join("\n");
}

export const kanbanAddTool = tool({
  description:
    "Add a task to the kanban backlog. Use when you identify work to be done, " +
    "a bug to fix, a feature to build, or any actionable item to track.",
  parameters: z.object({
    title: z.string().describe("Short task title (e.g. 'Fix auth bug', 'Add dark mode')"),
    project: z.string().optional().describe("Project name (default: 'default')"),
    type: z.enum(["chore", "bugfix", "feature", "epic", "research"]).optional()
      .describe("Task type (default: chore)"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional()
      .describe("Task priority (default: medium)"),
    size: z.enum(["small", "medium", "large", "xl"]).optional()
      .describe("Effort estimate (default: medium)"),
    due: z.string().optional().describe("Due date (ISO format)"),
    parent: z.number().optional().describe("Parent epic ID"),
    blocked_by: z.array(z.number()).optional().describe("IDs of blocking tasks"),
    body: z.string().optional().describe("Additional notes (markdown). If omitted, a template with standard sections is created."),
  }),
  execute: async ({ title, project, type, priority, size, due, parent, blocked_by, body }) => {
    try {
      const task = addTask(title, { project, type, priority, size, due, parent, blocked_by, body });
      return `Added #${task.id}: ${task.title} → backlog (${task.type}, ${task.priority}, ${task.size})`;
    } catch (err) {
      return `[error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const kanbanListTool = tool({
  description:
    "List tasks on the kanban board. Use to see what's in progress, " +
    "what's next in the backlog, or the full board state.",
  parameters: z.object({
    state: z.string().optional()
      .describe("Filter by state: backlog, in-progress, in-review, shipped (omit for all)"),
  }),
  execute: async ({ state }) => {
    try {
      const filterState = state && isValidState(state) ? state : undefined;
      const tasks = listTasks(filterState);
      if (tasks.length === 0) {
        return state ? `No tasks in ${state}.` : "Board is empty.";
      }
      return tasks.map(formatTask).join("\n");
    } catch (err) {
      return `[error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const kanbanMoveTool = tool({
  description:
    "Move a task to a new state on the kanban board. Enforces valid transitions: " +
    "backlog → in-progress → in-review → shipped. " +
    "Gate enforcement: backlog→in-progress requires filled body sections and explicit project; " +
    "all forward moves require unblocked status; shipping epics requires all children shipped. " +
    "Sendbacks (backward moves) are always allowed. Use kanban_check first to preview readiness.",
  parameters: z.object({
    id: z.number().describe("Task ID number"),
    to: z.string().describe("Target state: backlog, in-progress, in-review, shipped"),
  }),
  execute: async ({ id, to }) => {
    try {
      if (!isValidState(to)) {
        return `[error] Invalid state: ${to}. Must be: backlog, in-progress, in-review, shipped`;
      }
      const task = moveTask(id, to);
      return `Moved #${task.id} ${task.title} → ${to}`;
    } catch (err) {
      return `[error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const kanbanShowTool = tool({
  description:
    "Show full detail for a kanban task, including notes, transition history, " +
    "and child tasks (if epic).",
  parameters: z.object({
    id: z.number().describe("Task ID number"),
  }),
  execute: async ({ id }) => {
    try {
      const task = getTask(id);
      if (!task) return `[error] Task #${id} not found`;
      let detail = formatTaskDetail(task);
      if (task.type === "epic") {
        const children = getChildren(id);
        if (children.length > 0) {
          detail += "\n\nChild tasks:\n" + children.map(formatTask).join("\n");
        }
      }
      return detail;
    } catch (err) {
      return `[error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const kanbanSearchTool = tool({
  description:
    "Search kanban tasks by title, body, project, or type. Use to find past work, " +
    "related tasks, or tasks matching a keyword.",
  parameters: z.object({
    query: z.string().describe("Search query (matched against title, body, project, type)"),
  }),
  execute: async ({ query }) => {
    try {
      const results = searchTasks(query);
      if (results.length === 0) return `No tasks matching "${query}".`;
      return results.map(formatTask).join("\n");
    } catch (err) {
      return `[error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const kanbanCheckTool = tool({
  description:
    "Check if a task is ready to move to a target state. Returns a checklist of " +
    "gate requirements — what's met and what's missing. Use before moving tasks " +
    "to see what needs to be done first.",
  parameters: z.object({
    id: z.number().describe("Task ID number"),
    to: z.string().describe("Target state: backlog, in-progress, in-review, shipped"),
  }),
  execute: async ({ id, to }) => {
    try {
      if (!isValidState(to)) {
        return `[error] Invalid state: ${to}. Must be: backlog, in-progress, in-review, shipped`;
      }
      const result = checkTransitionGates(id, to);
      if (result.ok) {
        return `Task #${id} is ready to move to ${to}`;
      }
      const lines = [`Task #${id} is NOT ready to move to ${to}:`];
      for (const v of result.violations) {
        lines.push(`  - ${v.message}`);
      }
      return lines.join("\n");
    } catch (err) {
      return `[error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
