export const SUMMARY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>miniclaw — activity</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    background: #0d1117;
    color: #c9d1d9;
    min-height: 100vh;
    padding: 32px 40px;
    font-size: 13px;
    line-height: 1.6;
  }

  .header {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 28px;
    border-bottom: 1px solid #1c2333;
    padding-bottom: 16px;
  }
  .header-title { font-size: 15px; font-weight: 600; color: #e6edf3; letter-spacing: 0.5px; }
  .header-sub { font-size: 11px; color: #484f58; }
  .header-refresh { margin-left: auto; font-size: 11px; color: #484f58; }

  /* Stats bar */
  .stats {
    display: flex;
    gap: 24px;
    margin-bottom: 28px;
    padding: 12px 16px;
    background: #161b22;
    border: 1px solid #1c2333;
    border-radius: 6px;
    font-size: 12px;
  }
  .stat { display: flex; flex-direction: column; gap: 2px; }
  .stat-val { font-size: 20px; font-weight: 700; color: #e6edf3; line-height: 1; }
  .stat-label { color: #484f58; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; }
  .stat-divider { width: 1px; background: #1c2333; }

  /* Timeline */
  .timeline { display: flex; flex-direction: column; gap: 2px; }

  .section-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #484f58;
    padding: 12px 0 6px;
  }

  .event {
    display: grid;
    grid-template-columns: 52px 130px 1fr 120px;
    gap: 0 16px;
    align-items: center;
    padding: 7px 12px;
    border-radius: 4px;
    border-left: 2px solid transparent;
    transition: background 0.1s;
  }
  .event:hover { background: #161b22; }

  .event-time {
    color: #484f58;
    text-align: right;
    font-size: 11px;
    white-space: nowrap;
  }
  .event-time.fresh { color: #3fb950; }
  .event-time.recent { color: #8b949e; }

  .event-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 3px;
    white-space: nowrap;
    width: fit-content;
  }
  .badge-shipped    { background: #1a4731; color: #3fb950; border: 1px solid #238636; }
  .badge-in-review  { background: #1c2a3a; color: #58a6ff; border: 1px solid #1f6feb; }
  .badge-in-progress{ background: #2d1f00; color: #e3b341; border: 1px solid #9e6a03; }
  .badge-queued     { background: #1e1433; color: #a371f7; border: 1px solid #6e40c9; }
  .badge-backlog    { background: #161b22; color: #8b949e; border: 1px solid #30363d; }
  .badge-created    { background: #0d2119; color: #56d364; border: 1px solid #238636; }
  .badge-updated    { background: #161b22; color: #8b949e; border: 1px solid #30363d; }

  .event-title {
    color: #c9d1d9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .event-id { color: #484f58; margin-right: 6px; font-size: 11px; }

  .event-project {
    color: #484f58;
    font-size: 11px;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .event-link { text-decoration: none; color: inherit; display: contents; }

  .empty {
    color: #484f58;
    text-align: center;
    padding: 48px 0;
    font-size: 12px;
  }

  .divider { border: none; border-top: 1px solid #1c2333; margin: 8px 0; }

  /* Nav */
  .nav { display: flex; gap: 12px; margin-bottom: 24px; }
  .nav a {
    font-size: 12px;
    color: #484f58;
    text-decoration: none;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid #1c2333;
  }
  .nav a:hover { color: #c9d1d9; border-color: #30363d; }
  .nav a.active { color: #c9d1d9; border-color: #30363d; background: #161b22; }
</style>
</head>
<body>

<div class="header">
  <span class="header-title">⚡ ACTIVITY</span>
  <span class="header-sub" id="window-label">last 60 min</span>
  <span class="header-refresh" id="refresh-label">refreshing…</span>
</div>

<div class="nav">
  <a href="/kanban">Board</a>
  <a href="/kanban/summary" class="active">Summary</a>
</div>

<div class="stats" id="stats-bar">—</div>
<div class="timeline" id="timeline">
  <div class="empty">Loading…</div>
</div>

<script>
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function ago(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (diff < 60000) return "now";
  if (m < 60) return m + "m";
  return h + "h " + (m % 60) + "m";
}

function agoMs(ts) {
  return Date.now() - new Date(ts).getTime();
}

function freshness(ts) {
  const m = agoMs(ts) / 60000;
  if (m < 10) return "fresh";
  if (m < 30) return "recent";
  return "";
}

const BADGE = {
  "shipped":     ["badge-shipped",    "✓ shipped"],
  "in-review":   ["badge-in-review",  "◆ in review"],
  "in-progress": ["badge-in-progress","▶ in progress"],
  "queued":      ["badge-queued",     "◎ queued"],
  "backlog":     ["badge-backlog",    "· backlog"],
  "created":     ["badge-created",    "+ created"],
  "updated":     ["badge-updated",    "~ updated"],
};

async function render() {
  const data = await fetch("/api/kanban").then(r => r.json());
  const tasks = data.tasks || [];
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  // Collect events from history transitions + newly created tasks
  const events = [];

  for (const t of tasks) {
    // State transitions within window
    if (t.history && t.history.length > 0) {
      for (const h of t.history) {
        const ts = new Date(h.at).getTime();
        if (ts >= cutoff) {
          events.push({ ts, kind: h.to, id: t.id, title: t.title, project: t.project });
        }
      }
    }
    // Created within window
    const createdTs = new Date(t.createdAt).getTime();
    if (createdTs >= cutoff) {
      // Only add if no history entry already covers creation
      const hasHistoryAtCreation = (t.history || []).some(h => Math.abs(new Date(h.at).getTime() - createdTs) < 5000);
      if (!hasHistoryAtCreation) {
        events.push({ ts: createdTs, kind: "created", id: t.id, title: t.title, project: t.project });
      }
    }
    // Updated within window (but not created this window — avoid duplicate)
    const updatedTs = new Date(t.updatedAt).getTime();
    if (updatedTs >= cutoff && createdTs < cutoff) {
      const alreadyCovered = events.some(e => e.id === t.id && Math.abs(e.ts - updatedTs) < 60000);
      if (!alreadyCovered) {
        events.push({ ts: updatedTs, kind: "updated", id: t.id, title: t.title, project: t.project });
      }
    }
  }

  // Sort newest first
  events.sort((a, b) => b.ts - a.ts);

  // Stats
  const summary = data.summary || {};
  const shippedToday = tasks.filter(t => {
    const d = new Date(t.updatedAt);
    const today = new Date();
    return t.state === "shipped" &&
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
  }).length;

  const statsEl = document.getElementById("stats-bar");
  statsEl.innerHTML = \`
    <div class="stat"><span class="stat-val">\${tasks.length}</span><span class="stat-label">total</span></div>
    <div class="stat-divider"></div>
    <div class="stat"><span class="stat-val" style="color:#e3b341">\${summary.inProgress || 0}</span><span class="stat-label">in progress</span></div>
    <div class="stat-divider"></div>
    <div class="stat"><span class="stat-val" style="color:#a371f7">\${summary.queued || 0}</span><span class="stat-label">queued</span></div>
    <div class="stat-divider"></div>
    <div class="stat"><span class="stat-val" style="color:#3fb950">\${shippedToday}</span><span class="stat-label">shipped today</span></div>
    <div class="stat-divider"></div>
    <div class="stat"><span class="stat-val" style="color:#8b949e">\${events.length}</span><span class="stat-label">events / hr</span></div>
  \`;

  const timeline = document.getElementById("timeline");

  if (events.length === 0) {
    timeline.innerHTML = '<div class="empty">No activity in the last hour.</div>';
  } else {
    timeline.innerHTML = events.map(e => {
      const [badgeClass, label] = BADGE[e.kind] || BADGE["updated"];
      const projectSlug = e.project ? e.project.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "";
      const href = projectSlug ? \`/kanban/\${projectSlug}/\${e.id}\` : \`/kanban/\${e.id}\`;
      return \`<a class="event-link" href="\${href}">
        <div class="event" style="border-left-color: \${e.kind === 'shipped' ? '#238636' : e.kind === 'in-progress' ? '#9e6a03' : e.kind === 'in-review' ? '#1f6feb' : '#1c2333'}">
          <span class="event-time \${freshness(e.ts)}">\${ago(e.ts)}</span>
          <span class="event-badge \${badgeClass}">\${label}</span>
          <span class="event-title"><span class="event-id">#\${e.id}</span>\${e.title}</span>
          <span class="event-project">\${e.project || ""}</span>
        </div>
      </a>\`;
    }).join("");
  }

  document.getElementById("refresh-label").textContent = "updated " + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
}

render();
setInterval(render, 30000);
</script>
</body>
</html>`;
