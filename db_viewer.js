const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join('C:\\Users\\lokes\\Desktop\\Lokesh Claude\\Company app\\backend', 'test_database.sqlite');
const PORT = 7788;

const app = express();

// ── Helper: read all rows from a table ────────────────────────────────────────
function queryAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

// ── CSS + page shell ──────────────────────────────────────────────────────────
const PAGE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: #0f1117; color: #e0e0e0; }
  header {
    background: linear-gradient(135deg, #1a1f2e, #252d3d);
    padding: 20px 32px;
    border-bottom: 1px solid #2d3548;
    display: flex; align-items: center; gap: 16px;
  }
  header h1 { font-size: 22px; color: #7dd3fc; font-weight: 600; }
  header .sub { font-size: 12px; color: #64748b; margin-top: 2px; }
  header .badge {
    background: #16a34a; color: #fff; font-size: 11px;
    padding: 3px 10px; border-radius: 99px; margin-left: auto;
  }
  .tabs {
    display: flex; gap: 0; padding: 0 32px;
    background: #161b27; border-bottom: 1px solid #2d3548; overflow-x: auto;
  }
  .tab {
    padding: 14px 20px; font-size: 13px; cursor: pointer;
    border-bottom: 2px solid transparent; color: #94a3b8;
    white-space: nowrap; transition: all .15s;
  }
  .tab:hover { color: #e0e0e0; }
  .tab.active { color: #7dd3fc; border-bottom-color: #7dd3fc; }
  .tab .count {
    background: #1e293b; color: #64748b; font-size: 11px;
    padding: 2px 7px; border-radius: 99px; margin-left: 6px;
  }
  .tab.active .count { background: #0c2a4a; color: #7dd3fc; }
  .content { padding: 24px 32px; }
  .section { display: none; }
  .section.active { display: block; }
  .section-title {
    font-size: 16px; font-weight: 600; color: #cbd5e1; margin-bottom: 16px;
  }
  .table-wrap {
    overflow-x: auto; border-radius: 10px;
    border: 1px solid #2d3548;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    background: #1a2133; color: #94a3b8; font-weight: 600;
    padding: 10px 14px; text-align: left; white-space: nowrap;
    border-bottom: 1px solid #2d3548; font-size: 12px; text-transform: uppercase;
    letter-spacing: .5px;
  }
  td {
    padding: 10px 14px; border-bottom: 1px solid #1e293b;
    vertical-align: top; max-width: 300px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #1a2133; }
  .null { color: #374151; font-style: italic; }
  .badge-green { background:#14532d; color:#4ade80; padding:2px 8px; border-radius:99px; font-size:11px; }
  .badge-red   { background:#450a0a; color:#f87171; padding:2px 8px; border-radius:99px; font-size:11px; }
  .badge-yellow{ background:#422006; color:#fbbf24; padding:2px 8px; border-radius:99px; font-size:11px; }
  .badge-blue  { background:#0c2a4a; color:#7dd3fc; padding:2px 8px; border-radius:99px; font-size:11px; }
  .badge-purple{ background:#2e1065; color:#c4b5fd; padding:2px 8px; border-radius:99px; font-size:11px; }
  .badge-gray  { background:#1e293b; color:#94a3b8; padding:2px 8px; border-radius:99px; font-size:11px; }
  .refresh-btn {
    background: #1e40af; color: #fff; border: none; padding: 8px 18px;
    border-radius: 6px; font-size: 13px; cursor: pointer; margin-bottom: 16px;
    float: right;
  }
  .refresh-btn:hover { background: #2563eb; }
  .stats {
    display: flex; gap: 14px; margin-bottom: 20px; flex-wrap: wrap;
  }
  .stat {
    background: #1a2133; border: 1px solid #2d3548; border-radius: 10px;
    padding: 14px 20px; min-width: 140px; flex: 1;
  }
  .stat .val { font-size: 28px; font-weight: 700; color: #7dd3fc; }
  .stat .lbl { font-size: 12px; color: #64748b; margin-top: 4px; }
  .empty { color: #374151; font-style: italic; padding: 24px; text-align: center; }
`;

// ── Status badges ─────────────────────────────────────────────────────────────
function statusBadge(val) {
  if (!val) return `<span class="null">—</span>`;
  const map = {
    present:'green', paid:'green', approved:'green', completed:'green', active:'green',
    pending:'yellow', in_progress:'blue',
    rejected:'red', inactive:'red', absent:'red',
    manager:'purple', admin:'purple', employee:'gray',
    high:'red', medium:'yellow', low:'green',
  };
  const cls = map[val.toLowerCase()] || 'gray';
  return `<span class="badge-${cls}">${val}</span>`;
}

function cell(val, col) {
  if (val === null || val === undefined) return `<td class="null">null</td>`;
  const s = String(val);
  // status-like columns
  if (['status','role','priority','isActive'].includes(col)) {
    if (col === 'isActive') return `<td>${statusBadge(val ? 'active' : 'inactive')}</td>`;
    return `<td>${statusBadge(s)}</td>`;
  }
  // amount columns
  if (['amount'].includes(col) && !isNaN(val)) {
    return `<td>₹${Number(val).toLocaleString('en-IN')}</td>`;
  }
  // long JSON / token fields — truncate
  if (s.startsWith('[') || s.startsWith('{') || s.length > 80) {
    return `<td title="${s.replace(/"/g,'&quot;')}">${s.substring(0,60)}…</td>`;
  }
  if (s.startsWith('eyJ')) return `<td title="${s}"><span class="badge-gray">JWT token</span></td>`;
  return `<td>${s}</td>`;
}

function buildTable(rows) {
  if (!rows || rows.length === 0) return `<div class="empty">No records found</div>`;
  const keys = Object.keys(rows[0]);
  const header = keys.map(k => `<th>${k}</th>`).join('');
  const body = rows.map(row =>
    `<tr>${keys.map(k => cell(row[k], k)).join('')}</tr>`
  ).join('');
  return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// ── Main route ────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
  try {
    const [users, attendances, tasks, reimbursements, documents, notifications] = await Promise.all([
      queryAll(db, 'SELECT employeeId,firstName,lastName,email,role,department,designation,isActive,lastLogin,joiningDate,createdAt FROM Users ORDER BY employeeId'),
      queryAll(db, 'SELECT a.id, u.firstName||" "||u.lastName as employee, a.date, time(a.checkInTime) as checkIn, time(a.checkOutTime) as checkOut, a.status, a.workingHours, a.isManualEntry, a.notes FROM Attendances a LEFT JOIN Users u ON u.id=a.userId ORDER BY a.date DESC, a.createdAt DESC'),
      queryAll(db, 'SELECT t.id, t.title, u.firstName||" "||u.lastName as assignedTo, ab.firstName||" "||ab.lastName as assignedBy, t.priority, t.status, t.dueDate, t.estimatedHours, t.actualHours, t.createdAt FROM Tasks t LEFT JOIN Users u ON u.id=t.assignedTo LEFT JOIN Users ab ON ab.id=t.assignedBy ORDER BY t.createdAt DESC'),
      queryAll(db, 'SELECT r.id, u.firstName||" "||u.lastName as employee, r.title, r.category, r.amount, r.currency, r.expenseDate, r.status, r.remarks, r.createdAt FROM Reimbursements r LEFT JOIN Users u ON u.id=r.userId ORDER BY r.createdAt DESC'),
      queryAll(db, 'SELECT d.id, u.firstName||" "||u.lastName as employee, d.name, d.type, d.mimeType, d.fileSize, d.accessLevel, d.isVerified, d.createdAt FROM Documents d LEFT JOIN Users u ON u.id=d.userId ORDER BY d.createdAt DESC'),
      queryAll(db, 'SELECT n.id, u.firstName||" "||u.lastName as recipient, n.title, n.body, n.type, n.isRead, n.createdAt FROM Notifications n LEFT JOIN Users u ON u.id=n.userId ORDER BY n.createdAt DESC LIMIT 30'),
    ]);

    const attended16May = attendances.filter(a => a.date === '2026-05-16').length;
    const pendingClaims = reimbursements.filter(r => r.status === 'pending').length;
    const pendingTasks = tasks.filter(t => t.status === 'pending').length;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Company App — Database Viewer</title>
<style>${PAGE_CSS}</style>
</head>
<body>

<header>
  <div>
    <h1>🗄️ Company App — Live Database</h1>
    <div class="sub">test_database.sqlite &nbsp;·&nbsp; Refreshed at ${new Date().toLocaleTimeString()}</div>
  </div>
  <span class="badge">● LIVE</span>
</header>

<div class="content" style="padding:20px 32px 0">
  <div class="stats">
    <div class="stat"><div class="val">${users.length}</div><div class="lbl">Employees</div></div>
    <div class="stat"><div class="val">${attendances.length}</div><div class="lbl">Attendance Records</div></div>
    <div class="stat"><div class="val">${tasks.length}</div><div class="lbl">Tasks</div></div>
    <div class="stat"><div class="val">${reimbursements.length}</div><div class="lbl">Claims</div></div>
    <div class="stat"><div class="val">${documents.length}</div><div class="lbl">Documents</div></div>
    <div class="stat"><div class="val">${pendingClaims}</div><div class="lbl">Pending Claims</div></div>
    <div class="stat"><div class="val">${pendingTasks}</div><div class="lbl">Pending Tasks</div></div>
    <div class="stat"><div class="val">${attended16May}</div><div class="lbl">Present Today</div></div>
  </div>
</div>

<div class="tabs" id="tabs">
  <div class="tab active" onclick="show('users',this)">👥 Users <span class="count">${users.length}</span></div>
  <div class="tab" onclick="show('attendance',this)">🕐 Attendance <span class="count">${attendances.length}</span></div>
  <div class="tab" onclick="show('tasks',this)">✅ Tasks <span class="count">${tasks.length}</span></div>
  <div class="tab" onclick="show('claims',this)">💰 Claims <span class="count">${reimbursements.length}</span></div>
  <div class="tab" onclick="show('docs',this)">📄 Documents <span class="count">${documents.length}</span></div>
  <div class="tab" onclick="show('notifs',this)">🔔 Notifications <span class="count">${notifications.length}</span></div>
</div>

<div class="content">
  <button class="refresh-btn" onclick="location.reload()">↻ Refresh</button>

  <div id="users" class="section active">
    <div class="section-title">Users — ${users.length} records</div>
    ${buildTable(users)}
  </div>

  <div id="attendance" class="section">
    <div class="section-title">Attendance — ${attendances.length} records</div>
    ${buildTable(attendances)}
  </div>

  <div id="tasks" class="section">
    <div class="section-title">Tasks — ${tasks.length} records</div>
    ${buildTable(tasks)}
  </div>

  <div id="claims" class="section">
    <div class="section-title">Reimbursements / Claims — ${reimbursements.length} records</div>
    ${buildTable(reimbursements)}
  </div>

  <div id="docs" class="section">
    <div class="section-title">Documents — ${documents.length} records</div>
    ${buildTable(documents)}
  </div>

  <div id="notifs" class="section">
    <div class="section-title">Notifications (last 30) — ${notifications.length} records</div>
    ${buildTable(notifications)}
  </div>
</div>

<script>
function show(id, tab) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  tab.classList.add('active');
}
</script>

</body>
</html>`);
  } catch (e) {
    res.status(500).send(`<pre style="color:red">${e.message}</pre>`);
  } finally {
    db.close();
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ DB Viewer running at: http://localhost:${PORT}\n`);
});
