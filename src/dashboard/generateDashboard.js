import fs from "node:fs";
import path from "node:path";

const DASHBOARD_PATH = path.join(process.cwd(), "data", "dashboard.html");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

export function generateDashboard({ skills, tools, approvals, history, connectors, logs = [] }) {
  const metrics = {
    skills: skills.length,
    tools: tools.length,
    pendingApprovals: approvals.filter((item) => item.status === "pending").length,
    recentRuns: history.length,
    auditEntries: logs.length,
  };
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Codex General Local Agent Dashboard</title>
  <style>
    :root { color-scheme: light; --border: #d8dee4; --muted: #57606a; --bg: #f6f8fa; --text: #24292f; --accent: #0969da; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; color: var(--text); background: white; line-height: 1.45; }
    header { padding: 24px 32px 16px; border-bottom: 1px solid var(--border); background: var(--bg); }
    main { padding: 24px 32px 40px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    section { margin-bottom: 28px; }
    .muted { color: var(--muted); }
    .metrics { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 12px; margin-top: 18px; }
    .metric { border: 1px solid var(--border); background: white; padding: 12px; border-radius: 8px; }
    .metric strong { display: block; font-size: 22px; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
    input, select { min-height: 34px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font: inherit; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th, td { border: 1px solid var(--border); padding: 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: var(--bg); font-weight: 600; }
    code { background: var(--bg); padding: 2px 4px; border-radius: 4px; }
    .status { font-weight: 600; }
    .pending, .approval_required, .failed, .blocked { color: #bc4c00; }
    .approved, .success, .completed { color: #1a7f37; }
    .rejected { color: #cf222e; }
    @media (max-width: 900px) { .metrics { grid-template-columns: repeat(2, minmax(120px, 1fr)); } main, header { padding-left: 16px; padding-right: 16px; } }
  </style>
</head>
<body>
  <header>
    <h1>Codex General Local Agent Dashboard</h1>
    <div class="muted">Generated ${escapeHtml(new Date().toISOString())}</div>
    <div class="metrics">
      ${Object.entries(metrics).map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`).join("")}
    </div>
  </header>
  <main>
    <section>
      <h2>Approvals</h2>
      <div class="toolbar">
        <input id="approvalSearch" placeholder="Search approvals">
        <select id="approvalStatus"><option value="">All statuses</option></select>
      </div>
      <table><thead><tr><th>Status</th><th>Skill</th><th>Tool</th><th>Risk</th><th>Preview</th><th>Commands</th></tr></thead><tbody id="approvalRows"></tbody></table>
    </section>
    <section>
      <h2>Run History</h2>
      <div class="toolbar">
        <input id="historySearch" placeholder="Search runs">
        <select id="historyStatus"><option value="">All statuses</option></select>
      </div>
      <table><thead><tr><th>Time</th><th>Status</th><th>Skill</th><th>Source</th><th>Run ID</th></tr></thead><tbody id="historyRows"></tbody></table>
    </section>
    <section>
      <h2>Audit Log</h2>
      <div class="toolbar">
        <input id="logSearch" placeholder="Search audit logs">
        <select id="logStatus"><option value="">All statuses</option></select>
        <select id="logTool"><option value="">All tools</option></select>
      </div>
      <table><thead><tr><th>Time</th><th>Status</th><th>Skill</th><th>Tool</th><th>Decision</th><th>Error</th></tr></thead><tbody id="logRows"></tbody></table>
    </section>
    <section>
      <h2>Skills</h2>
      <table><tr><th>Name</th><th>Risk</th><th>Description</th></tr>
        ${skills.map((skill) => `<tr><td><code>${escapeHtml(skill.name)}</code></td><td>${escapeHtml(skill.riskLevel)}</td><td>${escapeHtml(skill.description)}</td></tr>`).join("")}
      </table>
    </section>
    <section>
      <h2>Tools</h2>
      <table><tr><th>Name</th><th>Risk</th><th>Description</th></tr>
        ${tools.map((tool) => `<tr><td><code>${escapeHtml(tool.name)}</code></td><td>${escapeHtml(tool.riskLevel)}</td><td>${escapeHtml(tool.description)}</td></tr>`).join("")}
      </table>
    </section>
    <section>
      <h2>Connectors</h2>
      <table><tr><th>Name</th><th>Type</th><th>Status</th><th>Description</th></tr>
        ${connectors.map((connector) => `<tr><td><code>${escapeHtml(connector.name)}</code></td><td>${escapeHtml(connector.type)}</td><td>${escapeHtml(connector.status)}</td><td>${escapeHtml(connector.description)}</td></tr>`).join("")}
      </table>
    </section>
  </main>
  <script>
    const data = ${safeJson({ approvals, history, logs, statusCounts: { approvals: countBy(approvals, "status"), history: countBy(history, "status"), logs: countBy(logs, "status") } })};
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const textOf = (value) => JSON.stringify(value ?? "").toLowerCase();
    const statusClass = (value) => String(value || "").replace(/[^a-z0-9_-]/gi, "_");
    function fillSelect(id, values) {
      const select = document.getElementById(id);
      [...new Set(values.filter(Boolean))].sort().forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
    }
    function renderApprovals() {
      const query = document.getElementById("approvalSearch").value.toLowerCase();
      const status = document.getElementById("approvalStatus").value;
      const rows = data.approvals
        .filter((item) => (!status || item.status === status) && (!query || textOf(item).includes(query)))
        .slice(-80)
        .reverse()
        .map((item) => '<tr><td class="status ' + statusClass(item.status) + '">' + esc(item.status) + '</td><td>' + esc(item.skill) + '</td><td>' + esc(item.tool) + '</td><td>' + esc(item.riskLevel) + '</td><td><pre>' + esc(JSON.stringify(item.preview, null, 2)).slice(0, 600) + '</pre></td><td><code>' + esc(item.approveCommand || "") + '</code><br><code>' + esc(item.rejectCommand || "") + '</code></td></tr>');
      document.getElementById("approvalRows").innerHTML = rows.join("") || '<tr><td colspan="6">No approvals match.</td></tr>';
    }
    function renderHistory() {
      const query = document.getElementById("historySearch").value.toLowerCase();
      const status = document.getElementById("historyStatus").value;
      const rows = data.history
        .filter((item) => (!status || item.status === status) && (!query || textOf(item).includes(query)))
        .slice(-80)
        .reverse()
        .map((item) => '<tr><td>' + esc(item.timestamp) + '</td><td class="status ' + statusClass(item.status) + '">' + esc(item.status) + '</td><td>' + esc(item.task?.skillName || item.skill) + '</td><td>' + esc(item.task?.source || "") + '</td><td><code>' + esc(item.result?.agentRunId || item.id) + '</code></td></tr>');
      document.getElementById("historyRows").innerHTML = rows.join("") || '<tr><td colspan="5">No runs match.</td></tr>';
    }
    function renderLogs() {
      const query = document.getElementById("logSearch").value.toLowerCase();
      const status = document.getElementById("logStatus").value;
      const tool = document.getElementById("logTool").value;
      const rows = data.logs
        .filter((item) => (!status || item.status === status) && (!tool || item.tool === tool) && (!query || textOf(item).includes(query)))
        .slice(-120)
        .reverse()
        .map((item) => '<tr><td>' + esc(item.timestamp) + '</td><td class="status ' + statusClass(item.status) + '">' + esc(item.status) + '</td><td>' + esc(item.skill) + '</td><td>' + esc(item.tool) + '</td><td>' + esc(item.permissionDecision) + '</td><td>' + esc(item.error) + '</td></tr>');
      document.getElementById("logRows").innerHTML = rows.join("") || '<tr><td colspan="6">No audit logs match.</td></tr>';
    }
    fillSelect("approvalStatus", data.approvals.map((item) => item.status));
    fillSelect("historyStatus", data.history.map((item) => item.status));
    fillSelect("logStatus", data.logs.map((item) => item.status));
    fillSelect("logTool", data.logs.map((item) => item.tool));
    ["approvalSearch", "approvalStatus"].forEach((id) => document.getElementById(id).addEventListener("input", renderApprovals));
    ["historySearch", "historyStatus"].forEach((id) => document.getElementById(id).addEventListener("input", renderHistory));
    ["logSearch", "logStatus", "logTool"].forEach((id) => document.getElementById(id).addEventListener("input", renderLogs));
    renderApprovals();
    renderHistory();
    renderLogs();
  </script>
</body>
</html>`;
  fs.writeFileSync(DASHBOARD_PATH, html, "utf8");
  return DASHBOARD_PATH;
}
