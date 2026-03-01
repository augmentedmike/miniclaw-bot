export const KANBAN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>miniclaw — kanban</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0d1117;
    color: #c9d1d9;
    min-height: 100vh;
  }

  /* ── Top bar ──────────────────────────────────────── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    border-bottom: 1px solid #1c2333;
    background: #0d1117;
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .topbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #8b949e;
  }
  .topbar-left strong { color: #e6edf3; font-weight: 600; }
  .topbar-left .sep { color: #30363d; }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .topbar-stats {
    font-size: 13px;
    color: #8b949e;
  }
  .project-select {
    background: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    padding-right: 24px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238b949e'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
  }
  .project-select:hover { border-color: #8b949e; }

  /* ── Board ────────────────────────────────────────── */
  .board {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0;
    padding: 0;
    min-height: calc(100vh - 49px);
  }
  @media (max-width: 1100px) {
    .board { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 700px) {
    .board { grid-template-columns: repeat(2, 1fr); }
  }

  /* ── Column ───────────────────────────────────────── */
  .column {
    border-right: 1px solid #1c2333;
    padding: 16px;
    min-height: 300px;
  }
  .column:last-child { border-right: none; }
  .column-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    padding-bottom: 12px;
  }
  .column-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .col-backlog .column-dot { background: #8b949e; }
  .col-queued .column-dot { background: #6e40c9; }
  .col-in-progress .column-dot { background: #d29922; }
  .col-in-review .column-dot { background: #d29922; }
  .col-shipped .column-dot { background: #3fb950; }
  /* Active loop indicator on cards */
  .loop-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: #6e40c9;
    font-weight: 600;
    letter-spacing: 0.02em;
    margin-top: 4px;
  }
  .loop-pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #6e40c9;
    animation: loopPulse 1.2s ease-in-out infinite;
  }
  @keyframes loopPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.7); }
  }
  /* Activity bar in topbar */
  .activity-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #8b949e;
    padding: 4px 10px;
    border: 1px solid #30363d;
    border-radius: 6px;
    cursor: default;
  }
  .activity-bar.active { color: #6e40c9; border-color: #6e40c9; }
  .activity-bar .loop-pulse { width: 6px; height: 6px; }
  .column-name {
    font-size: 14px;
    font-weight: 600;
    color: #e6edf3;
  }
  .column-count {
    font-size: 13px;
    color: #8b949e;
  }
  .column-collapse {
    margin-left: auto;
    background: none;
    border: none;
    color: #484f58;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
  }
  .column-collapse:hover { color: #8b949e; }

  /* ── Card ──────────────────────────────────────────── */
  .card {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .card:hover { border-color: #388bfd44; }
  .card-top {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .type-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 8px;
    border-radius: 4px;
    text-transform: capitalize;
  }
  .type-chore    { background: #1f3320; color: #56d364; }
  .type-bugfix   { background: #3d1f20; color: #f85149; }
  .type-feature  { background: #2d1f3d; color: #bc8cff; }
  .type-epic     { background: #1f2d3d; color: #58a6ff; }
  .type-research { background: #3d1f35; color: #f778ba; }
  .card-number {
    font-size: 12px;
    color: #484f58;
    font-family: "SF Mono", Monaco, Consolas, monospace;
  }
  .card-date {
    font-size: 11px;
    color: #484f58;
    margin-left: auto;
  }
  .card-title {
    font-size: 14px;
    line-height: 1.4;
    color: #e6edf3;
    font-weight: 500;
  }
  .card-bottom {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .card-epic-ref {
    font-size: 11px;
    color: #58a6ff;
    margin-top: 6px;
  }
  .card-epic-ref::before { content: "\\21B3 "; }
  .priority-pill {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: uppercase;
  }
  .pri-low      { background: #1f3320; color: #56d364; }
  .pri-medium   { background: #1c2333; color: #8b949e; }
  .pri-high     { background: #3d2f1f; color: #d29922; }
  .pri-critical { background: #3d1f20; color: #f85149; }
  .size-pill {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: #1c2333;
    color: #8b949e;
  }
  .status-pill {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .status-on-hold { background: #3d2f1f; color: #d29922; }
  .status-blocked { background: #3d1f20; color: #f85149; }
  .due-pill {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: #1c2333;
    color: #8b949e;
  }
  .due-pill.overdue { background: #3d1f20; color: #f85149; }
  .due-pill.soon    { background: #3d2f1f; color: #d29922; }
  .project-pill {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: #1f2d3d;
    color: #58a6ff;
  }
  .empty {
    color: #30363d;
    font-size: 13px;
    text-align: center;
    padding: 32px 0;
  }

  /* ── Detail overlay ───────────────────────────────── */
  .detail-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 100;
    justify-content: center;
    align-items: flex-start;
    padding: 48px 24px;
    overflow-y: auto;
  }
  .detail-overlay.open { display: flex; }
  .detail-panel {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 10px;
    padding: 24px;
    max-width: 680px;
    width: 100%;
  }
  .detail-close {
    float: right;
    background: none;
    border: none;
    color: #484f58;
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }
  .detail-close:hover { color: #c9d1d9; }
  .detail-title {
    font-size: 20px;
    font-weight: 600;
    color: #e6edf3;
    margin-bottom: 4px;
  }
  .detail-meta {
    font-size: 13px;
    color: #8b949e;
    margin-bottom: 16px;
    line-height: 1.6;
  }
  .detail-body {
    font-size: 14px;
    line-height: 1.7;
    color: #c9d1d9;
    white-space: pre-wrap;
    border-top: 1px solid #21262d;
    padding-top: 16px;
    margin-top: 16px;
  }
  .detail-history {
    font-size: 12px;
    color: #484f58;
    margin-top: 16px;
    border-top: 1px solid #21262d;
    padding-top: 12px;
  }
  .detail-history div { margin-bottom: 4px; }
  .detail-children {
    margin-top: 16px;
    border-top: 1px solid #21262d;
    padding-top: 12px;
  }
  .detail-children h3 {
    font-size: 13px;
    color: #8b949e;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .loading { color: #484f58; text-align: center; padding: 48px; }
  .error { color: #f85149; text-align: center; padding: 48px; }

  /* Markdown body rendering */
  .detail-body h1 { font-size: 1.15em; font-weight: 700; margin: 1em 0 0.4em; color: #e6edf3; }
  .detail-body h2 { font-size: 1.05em; font-weight: 600; margin: 0.9em 0 0.35em; color: #e6edf3; border-bottom: 1px solid #21262d; padding-bottom: 0.2em; }
  .detail-body h3 { font-size: 0.95em; font-weight: 600; margin: 0.75em 0 0.3em; color: #8b949e; }
  .detail-body p { margin: 0.5em 0; line-height: 1.65; }
  .detail-body ul, .detail-body ol { padding-left: 1.4em; margin: 0.4em 0; }
  .detail-body li { margin: 0.2em 0; line-height: 1.6; }
  .detail-body ul li { list-style-type: disc; }
  .detail-body ol li { list-style-type: decimal; }
  .detail-body ul.checklist { list-style: none; padding-left: 0.2em; }
  .detail-body ul.checklist li.cb-item { display: flex; align-items: flex-start; gap: 6px; list-style: none; }
  .detail-body ul.checklist input[type="checkbox"] { margin-top: 3px; accent-color: #3fb950; cursor: default; flex-shrink: 0; }
  .detail-body code { font-family: monospace; font-size: 0.85em; background: rgba(255,255,255,0.07); padding: 0.1em 0.35em; border-radius: 3px; color: #79c0ff; }
  .detail-body pre { background: rgba(0,0,0,0.35); border: 1px solid #30363d; border-radius: 6px; padding: 0.85em; overflow-x: auto; margin: 0.6em 0; }
  .detail-body pre code { background: none; padding: 0; color: #e6edf3; }
  .detail-body blockquote { border-left: 3px solid #388bfd; padding-left: 0.7em; margin: 0.5em 0; color: #8b949e; font-style: italic; }
  .detail-body strong { font-weight: 600; color: #e6edf3; }
  .detail-body em { font-style: italic; color: #8b949e; }
  .detail-body a { color: #58a6ff; text-decoration: underline; }
  .detail-body hr { border: none; border-top: 1px solid #21262d; margin: 0.8em 0; }
  .detail-body > *:first-child { margin-top: 0; }
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-left">
    <strong>miniclaw</strong>
    <select class="project-select" id="project-filter" onchange="filterProject()">
      <option value="">All projects</option>
    </select>
    <span class="topbar-stats" id="stats"></span>
  </div>
  <div class="topbar-right">
    <div class="activity-bar" id="activity-bar">&#9675; no active loops</div>
  </div>
</div>
<div class="board" id="board">
  <div class="loading">Loading board...</div>
</div>
<div class="detail-overlay" id="overlay" onclick="if(event.target===this)closeDetail()">
  <div class="detail-panel" id="detail"></div>
</div>
<script>
const STATES = ["backlog", "queued", "in-progress", "in-review", "shipped"];
const STATE_LABELS = { "backlog": "Backlog", "queued": "Queued", "in-progress": "In Progress", "in-review": "In Review", "shipped": "Shipped" };
let allTasks = [];
let currentProject = "";
let activeLoops = []; // from /api/activity
let dispatchLog = []; // from /api/activity

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderMarkdown(md) {
  if (!md) return "";

  // ── Pre-processing: normalize inline list items onto their own lines ──
  md = md.split("\\n").map(function(line) {
    // "1. item 2. item" → split on newlines
    if (/^\\d+\\.\\s/.test(line) && / \\d+\\.\\s/.test(line)) {
      return line.replace(/ (\\d+)\\.\\s+/g, "\\n$1. ");
    }
    // "(1) item (2) item" anywhere in line → convert to numbered list items
    if (/\\(\\d+\\)/.test(line) && /\\(\\d+\\).+\\(\\d+\\)/.test(line)) {
      // Extract prefix before first (1)
      const firstIdx = line.search(/\\(\\d+\\)/);
      const prefix = firstIdx > 0 ? line.slice(0, firstIdx).trim() : "";
      const listPart = line.slice(firstIdx);
      // Split on (N) boundaries, convert to "N. text"
      const converted = listPart
        .replace(/\\((\\d+)\\)\\s*/g, "\\n$1. ")
        .trim();
      return (prefix ? prefix + "\\n" : "") + converted;
    }
    // Unordered: line starts with "- " or "* " AND has " - " or " * " inline
    if (/^[-*]\\s/.test(line) && / [-*]\\s/.test(line)) {
      return line.replace(/ ([-*])\\s+(?=\\S)/g, "\\n$1 ");
    }
    // Checkbox lists: "- [ ] item - [ ] item"
    if (/^-\\s\\[[ x]\\]/.test(line) && / -\\s\\[[ x]\\]/.test(line)) {
      return line.replace(/ (-\\s\\[[ x]\\])/g, "\\n$1");
    }
    return line;
  }).join("\\n");

  const BT = "\\x60";
  const fence = new RegExp(BT + BT + BT + "[\\\\w]*\\\\n?([\\\\s\\\\S]*?)" + BT + BT + BT, "g");
  const inlineCode = new RegExp(BT + "(.+?)" + BT, "g");
  let html = escapeHtml(md);
  // Code blocks first (before inline code)
  html = html.replace(fence, (_, c) => "<pre><code>" + c.trim() + "</code></pre>");
  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Bold / italic
  html = html.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
  html = html.replace(/\\*(.+?)\\*/g, "<em>$1</em>");
  // Inline code
  html = html.replace(inlineCode, "<code>$1</code>");
  // Checkbox lists (before unordered so we can style them)
  html = html.replace(/((?:^- \\[[ x]\\] .+\\n?)+)/gm, function(block) {
    const items = block.trim().split("\\n").map(function(l) {
      const checked = /^- \\[x\\]/i.test(l);
      const text = l.replace(/^- \\[[ x]\\]\\s*/i, "");
      return "<li class=\\"cb-item\\">" +
        "<input type=\\"checkbox\\" disabled" + (checked ? " checked" : "") + "> " +
        text + "</li>";
    }).join("");
    return "<ul class=\\"checklist\\">" + items + "</ul>";
  });
  // Unordered lists
  html = html.replace(/((?:^[-*] .+\\n?)+)/gm, function(block) {
    const items = block.trim().split("\\n").map(function(l) {
      return "<li>" + l.replace(/^[-*]\\s+/, "") + "</li>";
    }).join("");
    return "<ul>" + items + "</ul>";
  });
  // Ordered lists
  html = html.replace(/((?:^\\d+\\. .+\\n?)+)/gm, function(block) {
    const items = block.trim().split("\\n").map(function(l) {
      return "<li>" + l.replace(/^\\d+\\.\\s+/, "") + "</li>";
    }).join("");
    return "<ol>" + items + "</ol>";
  });
  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");
  // Paragraphs
  html = html.split(/\\n\\n+/).map(function(block) {
    block = block.trim();
    if (!block) return "";
    if (/^<(h[1-6]|ul|ol|pre|hr)/.test(block)) return block;
    return "<p>" + block.replace(/\\n/g, " ") + "</p>";
  }).join("\\n");
  return html;
}

function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function dueClass(iso) {
  if (!iso) return "";
  const now = Date.now();
  const due = new Date(iso).getTime();
  if (due < now) return "overdue";
  if (due < now + 3 * 86400000) return "soon";
  return "";
}

function updateProjectDropdown(tasks) {
  const select = document.getElementById("project-filter");
  const projects = [...new Set(tasks.map(t => t.project))].sort();
  const prev = select.value;
  select.innerHTML = '<option value="">All projects</option>';
  for (const p of projects) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    if (p === prev) opt.selected = true;
    select.appendChild(opt);
  }
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function kanbanPath(project, ticketId) {
  const base = "/kanban";
  if (!project) return ticketId ? base + "/" + ticketId : base;
  const slug = slugify(project);
  return ticketId ? base + "/" + slug + "/" + ticketId : base + "/" + slug;
}

function filterProject() {
  currentProject = document.getElementById("project-filter").value;
  history.replaceState({}, "", kanbanPath(currentProject, null));
  renderBoard(allTasks);
}

function renderBoard(tasks) {
  allTasks = tasks;
  updateProjectDropdown(tasks);

  const visible = currentProject ? tasks.filter(t => t.project === currentProject) : tasks;
  const board = document.getElementById("board");
  const stats = document.getElementById("stats");

  const grouped = {};
  for (const s of STATES) grouped[s] = [];
  for (const t of visible) {
    if (grouped[t.state]) grouped[t.state].push(t);
  }

  const total = visible.length;
  const shipped = grouped["shipped"].length;
  stats.textContent = total + " tickets" + (shipped > 0 ? "  \\u00B7  " + shipped + " done" : "");

  board.innerHTML = "";
  for (const state of STATES) {
    const col = document.createElement("div");
    col.className = "column col-" + state;

    col.innerHTML =
      '<div class="column-header">' +
        '<span class="column-dot"></span>' +
        '<span class="column-name">' + STATE_LABELS[state] + '</span>' +
        '<span class="column-count">(' + grouped[state].length + ')</span>' +
      '</div>';

    if (grouped[state].length === 0) {
      col.innerHTML += '<div class="empty">No tasks</div>';
    } else {
      for (const task of grouped[state]) {
        col.appendChild(renderCard(task));
      }
    }
    board.appendChild(col);
  }
}

function renderCard(task) {
  const card = document.createElement("div");
  card.className = "card";
  card.onclick = () => showDetail(task.id);

  // Top row: type badge, number, date
  let topHtml =
    '<span class="type-badge type-' + task.type + '">' + escapeHtml(task.type) + '</span>' +
    '<span class="card-number">#' + task.id + '</span>' +
    '<span class="card-date">' + shortDate(task.created) + '</span>';

  // Title
  let titleHtml = '<div class="card-title">' + escapeHtml(task.title) + '</div>';

  // Epic reference
  let epicHtml = "";
  if (task.parent) {
    const parent = allTasks.find(t => t.id === task.parent);
    const parentTitle = parent ? parent.title : "Epic #" + task.parent;
    epicHtml = '<div class="card-epic-ref">EPIC: ' + escapeHtml(parentTitle) + '</div>';
  }

  // Bottom row: project, priority, size, status, due
  let bottomHtml = "";
  const pills = [];
  if (task.project && task.project !== "default") {
    pills.push('<span class="project-pill">' + escapeHtml(task.project) + '</span>');
  }
  if (task.priority !== "medium") {
    pills.push('<span class="priority-pill pri-' + task.priority + '">' + task.priority + '</span>');
  }
  pills.push('<span class="size-pill">' + task.size + '</span>');
  if (task.status === "on-hold") {
    pills.push('<span class="status-pill status-on-hold">on hold</span>');
  } else if (task.status === "blocked") {
    pills.push('<span class="status-pill status-blocked">blocked</span>');
  }
  if (task.due) {
    const dc = dueClass(task.due);
    pills.push('<span class="due-pill ' + dc + '">' + shortDate(task.due) + '</span>');
  }
  if (pills.length > 0) {
    bottomHtml = '<div class="card-bottom">' + pills.join("") + '</div>';
  }

  // Active loop indicator
  let loopHtml = "";
  const loop = activeLoops.find(l => l.ticketId === task.id);
  if (loop) {
    const phaseLabel = loop.phase || "working";
    loopHtml = '<div class="loop-indicator"><span class="loop-pulse"></span> agent: ' + escapeHtml(phaseLabel) + '</div>';
  }

  card.innerHTML =
    '<div class="card-top">' + topHtml + '</div>' +
    titleHtml +
    epicHtml +
    loopHtml +
    bottomHtml;

  return card;
}

function showDetail(id) {
  const task = allTasks.find(t => t.id === id);
  if (!task) return;

  const panel = document.getElementById("detail");
  let html = '<button class="detail-close" onclick="closeDetail()">\\u2715</button>';
  html += '<div class="card-top" style="margin-bottom:8px">';
  html += '<span class="type-badge type-' + task.type + '">' + escapeHtml(task.type) + '</span>';
  html += '<span class="card-number">#' + task.id + '</span>';
  html += '</div>';
  html += '<div class="detail-title">' + escapeHtml(task.title) + '</div>';

  let meta = task.project + ' \\u00B7 ' + task.priority + ' \\u00B7 ' + task.size + ' \\u00B7 ' + task.status;
  if (task.due) meta += ' \\u00B7 due ' + shortDate(task.due);
  if (task.parent) {
    const parent = allTasks.find(t => t.id === task.parent);
    meta += ' \\u00B7 epic #' + task.parent + (parent ? ' ' + parent.title : '');
  }
  if (task.blocked_by && task.blocked_by.length > 0) {
    meta += '\\nBlocked by: ' + task.blocked_by.map(b => '#' + b).join(', ');
  }
  meta += '\\nCreated: ' + shortDate(task.created) + ' \\u00B7 Updated: ' + shortDate(task.updated);
  html += '<div class="detail-meta">' + escapeHtml(meta) + '</div>';

  if (task.body) {
    html += '<div class="detail-body">' + renderMarkdown(task.body) + '</div>';
  }

  if (task.history && task.history.length > 0) {
    html += '<div class="detail-history"><strong>History</strong>';
    for (const h of task.history) {
      html += '<div>' + h.from + ' \\u2192 ' + h.to + '  ' + shortDate(h.at) + '</div>';
    }
    html += '</div>';
  }

  // Epic children
  if (task.type === "epic") {
    const children = allTasks.filter(t => t.parent === task.id);
    if (children.length > 0) {
      html += '<div class="detail-children"><h3>Child tasks</h3>';
      for (const c of children) {
        html += '<div class="card" onclick="closeDetail();setTimeout(()=>showDetail(' + c.id + '),100)" style="margin-bottom:6px">';
        html += '<div class="card-top"><span class="type-badge type-' + c.type + '">' + c.type + '</span>';
        html += '<span class="card-number">#' + c.id + '</span></div>';
        html += '<div class="card-title">' + escapeHtml(c.title) + '</div></div>';
      }
      html += '</div>';
    }
  }

  panel.innerHTML = html;
  document.getElementById("overlay").classList.add("open");
  history.pushState({ ticketId: id, project: currentProject }, "", kanbanPath(currentProject, id));
}

function closeDetail() {
  document.getElementById("overlay").classList.remove("open");
  history.pushState({}, "", kanbanPath(currentProject, null));
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
});

async function load() {
  const board = document.getElementById("board");
  try {
    const ts = Date.now();
    const [kanbanRes, activityRes] = await Promise.all([
      fetch("/api/kanban?_=" + ts),
      fetch("/api/activity?_=" + ts).catch(() => null),
    ]);
    if (!kanbanRes.ok) throw new Error("HTTP " + kanbanRes.status);
    const data = await kanbanRes.json();
    if (activityRes && activityRes.ok) {
      const actData = await activityRes.json();
      activeLoops = actData.loops || [];
      dispatchLog = actData.dispatch || [];
    }
    renderBoard(data.tasks || []);
    renderActivityBar();
  } catch (err) {
    board.innerHTML = '<div class="error">Failed to load board: ' + err.message + '</div>';
  }
}

function renderActivityBar() {
  const bar = document.getElementById("activity-bar");
  if (!bar) return;
  const running = activeLoops.filter(l => l.phase !== "done" && l.phase !== "failed");

  // Build tooltip: running loops + last 5 dispatch entries
  const loopLines = running.map(l => "● #" + l.ticketId + " " + l.ticketTitle + " [" + l.phase + "]");
  const recentDispatch = dispatchLog.slice(-8).reverse().map(d => {
    const t = new Date(d.at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
    const icon = d.action === "queued" ? "→" : d.action === "loop-started" ? "▶" : d.action === "loop-done" ? "✓" : d.action === "loop-failed" ? "✗" : "·";
    return t + " " + icon + " #" + d.ticketId + " " + (d.ticketTitle || "").slice(0, 40) + " [" + d.action + "]";
  });

  const tooltipLines = [];
  if (loopLines.length) tooltipLines.push("RUNNING:", ...loopLines, "");
  if (recentDispatch.length) tooltipLines.push("DISPATCH LOG:", ...recentDispatch);
  bar.title = tooltipLines.join("\\n") || "No activity";

  if (running.length === 0) {
    const lastAction = dispatchLog.length > 0 ? dispatchLog[dispatchLog.length - 1] : null;
    bar.className = "activity-bar";
    if (lastAction) {
      const t = new Date(lastAction.at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
      bar.innerHTML = "\\u25CB last: #" + lastAction.ticketId + " " + lastAction.action + " " + t;
    } else {
      bar.innerHTML = "\\u25CB no active loops";
    }
  } else {
    bar.className = "activity-bar active";
    bar.innerHTML = '<span class="loop-pulse"></span> ' + running.length + ' loop' + (running.length > 1 ? "s" : "") + " running";
  }
}

// Surface any uncaught JS errors on the page
window.onerror = function(msg, src, line, col, err) {
  const board = document.getElementById("board");
  if (board) {
    board.innerHTML = '<div class="error" style="white-space:pre-wrap">JS Error: ' + msg + '\\n' + (src || '') + ':' + line + ':' + col + '</div>';
  }
  return false;
};
window.onunhandledrejection = function(e) {
  const board = document.getElementById("board");
  if (board && board.innerHTML.includes('Loading board')) {
    board.innerHTML = '<div class="error">Unhandled error: ' + String(e.reason) + '</div>';
  }
};

load().then(() => {
  // Deep-link: parse path — /kanban/[project-slug] or /kanban/[project-slug]/[id] or /kanban/[id]
  const pathParts = location.pathname.replace(/^\\/kanban\\/?/, "").split("/").filter(Boolean);
  const firstIsId = pathParts.length === 1 && /^\\d+$/.test(pathParts[0]);
  const projSlug = (!firstIsId && pathParts.length >= 1) ? pathParts[0] : null;
  const ticketFromPath = pathParts.length === 2 ? pathParts[1] : (firstIsId ? pathParts[0] : null);

  if (projSlug) {
    // Match slug back to a real project name (case-insensitive slug compare)
    const match = allTasks.map(t => t.project).find(p => p && slugify(p) === projSlug);
    if (match) {
      const select = document.getElementById("project-filter");
      if (select) { select.value = match; currentProject = match; renderBoard(allTasks); }
    }
  }

  // Deep-link: open ticket if path ends with a ticket id
  if (ticketFromPath) showDetail(parseInt(ticketFromPath, 10));
});
setInterval(load, 30000);

window.addEventListener("popstate", (e) => {
  if (e.state && e.state.ticketId) {
    showDetail(e.state.ticketId);
  } else {
    closeDetail();
  }
});
</script>
</body>
</html>`;
