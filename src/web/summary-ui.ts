export const SUMMARY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AM — Activity</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    background: #0d1117;
    color: #c9d1d9;
    min-height: 100vh;
    font-size: 13px;
    line-height: 1.6;
  }

  /* ── Top bar ── */
  .topbar {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 24px;
    background: #161b22;
    border-bottom: 1px solid #1c2333;
    position: sticky; top: 0; z-index: 100;
  }
  .topbar-logo { font-weight: 700; color: #e6edf3; font-size: 14px; letter-spacing: 0.5px; }
  .nav { display: flex; gap: 8px; }
  .nav a {
    font-size: 12px; color: #484f58; text-decoration: none;
    padding: 4px 10px; border-radius: 4px; border: 1px solid transparent;
  }
  .nav a:hover { color: #c9d1d9; border-color: #30363d; }
  .nav a.active { color: #c9d1d9; border-color: #30363d; background: #0d1117; }
  .topbar-ts { margin-left: auto; font-size: 11px; color: #484f58; }

  /* ── Stats bar ── */
  .stats {
    display: flex; gap: 24px; padding: 12px 24px;
    background: #0d1117; border-bottom: 1px solid #1c2333;
  }
  .stat { display: flex; flex-direction: column; gap: 2px; }
  .stat-val { font-size: 22px; font-weight: 700; color: #e6edf3; line-height: 1; }
  .stat-label { color: #484f58; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; }
  .stat-divider { width: 1px; background: #1c2333; }

  /* ── Two-column layout ── */
  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    height: calc(100vh - 120px);
  }
  .col {
    padding: 16px 20px;
    overflow-y: auto;
    border-right: 1px solid #1c2333;
  }
  .col:last-child { border-right: none; }
  .col-header {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px;
    color: #484f58; padding-bottom: 10px; margin-bottom: 10px;
    border-bottom: 1px solid #1c2333;
    display: flex; align-items: center; gap: 8px;
  }
  .col-header .count {
    font-size: 11px; background: #161b22; border: 1px solid #30363d;
    padding: 1px 6px; border-radius: 3px; color: #8b949e;
  }

  /* ── Event row ── */
  .event {
    display: grid;
    grid-template-columns: 44px 110px 1fr;
    gap: 0 12px;
    align-items: center;
    padding: 6px 10px;
    border-radius: 4px;
    border-left: 2px solid transparent;
    cursor: default;
  }
  .event:hover { background: #161b22; }
  .event-time { color: #484f58; text-align: right; font-size: 11px; white-space: nowrap; }
  .event-time.fresh  { color: #3fb950; }
  .event-time.recent { color: #8b949e; }
  .event-badge {
    font-size: 10px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase;
    padding: 2px 7px; border-radius: 3px; white-space: nowrap; width: fit-content;
  }
  .badge-shipped     { background: #1a4731; color: #3fb950; border: 1px solid #238636; }
  .badge-in-review   { background: #1c2a3a; color: #58a6ff; border: 1px solid #1f6feb; }
  .badge-in-progress { background: #2d1f00; color: #e3b341; border: 1px solid #9e6a03; }
  .badge-queued      { background: #1e1433; color: #a371f7; border: 1px solid #6e40c9; }
  .badge-backlog     { background: #161b22; color: #8b949e; border: 1px solid #30363d; }
  .badge-created     { background: #0d2119; color: #56d364; border: 1px solid #238636; }
  .badge-updated     { background: #161b22; color: #8b949e; border: 1px solid #30363d; }
  .badge-dispatch    { background: #1a2a1a; color: #56d364; border: 1px solid #238636; }
  .badge-loop-done   { background: #1a4731; color: #3fb950; border: 1px solid #238636; }
  .badge-loop-fail   { background: #3d1f20; color: #f85149; border: 1px solid #b91c1c; }
  .badge-heartbeat   { background: #161b22; color: #484f58; border: 1px solid #30363d; }
  .badge-loop-run    { background: #2d1f00; color: #e3b341; border: 1px solid #9e6a03; }

  .event-title { color: #c9d1d9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .event-id { color: #484f58; margin-right: 6px; font-size: 11px; }

  /* ── Active loop card ── */
  .loop-card {
    background: #161b22; border: 1px solid #9e6a03;
    border-radius: 6px; padding: 10px 14px; margin-bottom: 8px;
  }
  .loop-card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .loop-pulse {
    width: 8px; height: 8px; border-radius: 50%; background: #e3b341;
    animation: pulse 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  .loop-title { color: #e6edf3; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .loop-meta { font-size: 11px; color: #484f58; display: flex; gap: 12px; }
  .loop-phase { color: #e3b341; }

  .section-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
    color: #484f58; padding: 12px 10px 6px;
  }

  .empty { color: #484f58; text-align: center; padding: 32px 0; font-size: 12px; }
  .divider { border: none; border-top: 1px solid #1c2333; margin: 8px 0; }
</style>
</head>
<body>

<div class="topbar">
  <span class="topbar-logo">AM</span>
  <div class="nav">
    <a href="/">Chat</a>
    <a href="/kanban">Board</a>
    <a href="/kanban/activity" class="active">Activity</a>
  </div>
  <span class="topbar-ts" id="refresh-label">loading…</span>
</div>

<div class="stats" id="stats-bar">—</div>

<div class="columns">
  <!-- LEFT: Ticket activity timeline -->
  <div class="col" id="col-left">
    <div class="col-header">
      <span>Ticket Activity</span>
      <span class="count" id="left-count">—</span>
      <span style="margin-left:auto; font-size:11px; color:#484f58">last 60 min</span>
    </div>
    <div class="timeline" id="timeline">
      <div class="empty">Loading…</div>
    </div>
  </div>

  <!-- RIGHT: Heartbeat + Agent Loops + Dispatch log -->
  <div class="col" id="col-right">
    <div class="col-header">
      <span>Agent Loops &amp; Dispatch</span>
    </div>

    <div id="active-loops-section">
      <!-- Active loops injected here -->
    </div>

    <div class="section-label">Dispatch Log</div>
    <div id="dispatch-log">
      <div class="empty">No dispatch entries.</div>
    </div>
  </div>
</div>

<script>
const WINDOW_MS = 60 * 60 * 1000;

function ago(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (diff < 60000) return "now";
  if (m < 60) return m + "m";
  return h + "h " + (m % 60) + "m";
}
function freshness(ts) {
  const m = (Date.now() - new Date(ts).getTime()) / 60000;
  return m < 10 ? "fresh" : m < 30 ? "recent" : "";
}

const BADGE = {
  "shipped":     ["badge-shipped",    "✓ SHIPPED"],
  "in-review":   ["badge-in-review",  "◆ IN REVIEW"],
  "in-progress": ["badge-in-progress","▶ IN PROGRESS"],
  "queued":      ["badge-queued",     "◎ QUEUED"],
  "backlog":     ["badge-backlog",    "· BACKLOG"],
  "created":     ["badge-created",    "+ CREATED"],
  "updated":     ["badge-updated",    "~ UPDATED"],
};

const DISPATCH_BADGE = {
  "dispatched":    ["badge-dispatch",  "→ DISPATCHED"],
  "queued":        ["badge-dispatch",  "→ QUEUED"],
  "loop-started":  ["badge-loop-run",  "▶ STARTED"],
  "loop-done":     ["badge-loop-done", "✓ DONE"],
  "loop-failed":   ["badge-loop-fail", "✗ FAILED"],
  "heartbeat":     ["badge-heartbeat", "♥ HEARTBEAT"],
};

async function render() {
  const [kanbanData, actData] = await Promise.all([
    fetch("/api/kanban?_=" + Date.now()).then(r => r.json()).catch(() => ({})),
    fetch("/api/activity?_=" + Date.now()).then(r => r.json()).catch(() => ({})),
  ]);

  const tasks = kanbanData.tasks || [];
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const loops = actData.loops || [];
  const dispatchEntries = actData.dispatch || [];

  // ── Stats ──────────────────────────────────
  const summary = kanbanData.summary || {};
  const counts = summary.counts || {};
  const today = new Date().toDateString();
  const shippedToday = tasks.filter(t => {
    const d = new Date(t.updated || t.updatedAt || 0);
    return t.state === "shipped" && d.toDateString() === today;
  }).length;

  const activeLoopCount = loops.filter(l => l.phase !== "done" && l.phase !== "failed").length;

  // Eligible for dispatch: backlog, no blockers, not large/xl
  const queuedCount = tasks.filter(t =>
    t.state === "backlog" &&
    (!t.blocked_by || t.blocked_by.length === 0) &&
    t.size !== "large" && t.size !== "xl"
  ).length;

  document.getElementById("stats-bar").innerHTML = \`
    <div class="stat"><span class="stat-val">\${tasks.length}</span><span class="stat-label">total</span></div>
    <div class="stat-divider"></div>
    <div class="stat"><span class="stat-val" style="color:#e3b341">\${counts["in-progress"] || 0}</span><span class="stat-label">in progress</span></div>
    <div class="stat-divider"></div>
    <div class="stat"><span class="stat-val" style="color:#a371f7">\${queuedCount}</span><span class="stat-label">queued</span></div>
    <div class="stat-divider"></div>
    <div class="stat"><span class="stat-val" style="color:#3fb950">\${shippedToday}</span><span class="stat-label">shipped today</span></div>
    <div class="stat-divider"></div>
    <div class="stat"><span class="stat-val" style="color:#e3b341">\${activeLoopCount}</span><span class="stat-label">active loops</span></div>
  \`;

  // ── LEFT: ticket timeline ──────────────────
  const events = [];
  for (const t of tasks) {
    if (t.history) {
      for (const h of t.history) {
        const ts = new Date(h.at).getTime();
        if (ts >= cutoff) events.push({ ts, kind: h.to, id: t.id, title: t.title });
      }
    }
    const createdTs = new Date(t.createdAt).getTime();
    if (createdTs >= cutoff) {
      const covered = (t.history || []).some(h => Math.abs(new Date(h.at).getTime() - createdTs) < 5000);
      if (!covered) events.push({ ts: createdTs, kind: "created", id: t.id, title: t.title });
    }
    const updatedTs = new Date(t.updatedAt).getTime();
    if (updatedTs >= cutoff && createdTs < cutoff) {
      const dup = events.some(e => e.id === t.id && Math.abs(e.ts - updatedTs) < 60000);
      if (!dup) events.push({ ts: updatedTs, kind: "updated", id: t.id, title: t.title });
    }
  }
  events.sort((a, b) => b.ts - a.ts);

  document.getElementById("left-count").textContent = events.length;
  const tl = document.getElementById("timeline");
  if (events.length === 0) {
    tl.innerHTML = '<div class="empty">No ticket activity in the last hour.</div>';
  } else {
    tl.innerHTML = events.map(e => {
      const [bc, label] = BADGE[e.kind] || BADGE["updated"];
      const borderColor = e.kind === "shipped" ? "#238636" : e.kind === "in-progress" ? "#9e6a03" : e.kind === "in-review" ? "#1f6feb" : "#1c2333";
      return \`<div class="event" style="border-left-color:\${borderColor}">
        <span class="event-time \${freshness(e.ts)}">\${ago(e.ts)}</span>
        <span class="event-badge \${bc}">\${label}</span>
        <span class="event-title"><span class="event-id">#\${e.id}</span>\${e.title}</span>
      </div>\`;
    }).join("");
  }

  // ── RIGHT: Active loops ────────────────────
  const runningLoops = loops.filter(l => l.phase !== "done" && l.phase !== "failed");
  const loopsEl = document.getElementById("active-loops-section");
  if (runningLoops.length === 0) {
    loopsEl.innerHTML = '<div class="empty" style="padding:16px 0">○ No active agent loops</div>';
  } else {
    loopsEl.innerHTML = runningLoops.map(l => {
      const started = l.startedAt ? ago(l.startedAt) : "?";
      return \`<div class="loop-card">
        <div class="loop-card-top">
          <span class="loop-pulse"></span>
          <span class="loop-title">#\${l.ticketId} \${l.ticketTitle || l.title || ""}</span>
        </div>
        <div class="loop-meta">
          <span class="loop-phase">\${l.phase || "running"}</span>
          <span>started \${started}</span>
          \${l.notes ? '<span>' + l.notes.slice(0,60) + '</span>' : ''}
        </div>
      </div>\`;
    }).join("");
  }

  // ── RIGHT: Dispatch log ────────────────────
  const dispEl = document.getElementById("dispatch-log");
  const recentDispatch = [...dispatchEntries].reverse().slice(0, 30);
  if (recentDispatch.length === 0) {
    dispEl.innerHTML = '<div class="empty">No dispatch entries yet.</div>';
  } else {
    dispEl.innerHTML = recentDispatch.map(d => {
      const [bc, label] = DISPATCH_BADGE[d.action] || ["badge-updated", d.action.toUpperCase()];
      const borderColor = d.action === "loop-done" ? "#238636" : d.action === "loop-failed" ? "#b91c1c" : d.action.startsWith("dispatch") || d.action === "queued" ? "#9e6a03" : "#1c2333";
      const title = d.ticketTitle ? '#' + d.ticketId + ' ' + d.ticketTitle : '#' + (d.ticketId || '?');
      return \`<div class="event" style="border-left-color:\${borderColor}">
        <span class="event-time \${freshness(d.at)}">\${ago(d.at)}</span>
        <span class="event-badge \${bc}">\${label}</span>
        <span class="event-title">\${title}</span>
      </div>\`;
    }).join("");
  }

  document.getElementById("refresh-label").textContent = "updated " + new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
}

render();
setInterval(render, 15000);
</script>
</body>
</html>`;
