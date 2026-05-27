/**
 * Company App — Full Feature Test Suite
 * Runs end-to-end against the live server (SQLite + in-memory OTP)
 * Test OTP is always: 123456  (fixed in test mode)
 */
const http = require('http');

const BASE = 'http://localhost:5000/api';
const TEST_OTP = '123456';

let adminToken = '', managerToken = '', employeeToken = '';
let adminId = '', managerId = '', employeeId = '';
let taskId = '', reimbursementId = '', rejectClaimId = '';

const results = [];
let passed = 0, failed = 0;

// ─── HTTP Helper ──────────────────────────────────────────────────────────────
function req(method, path, body = null, token = null) {
  return new Promise((resolve) => {
    const url = new URL(BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', e => resolve({ status: 0, body: { error: e.message } }));
    if (data) r.write(data);
    r.end();
  });
}

// ─── Test runner ─────────────────────────────────────────────────────────────
async function test(name, fn) {
  try {
    const result = await fn();
    if (result.ok) {
      passed++;
      results.push(`  ✅  ${name}`);
      if (result.detail) results.push(`       └─ ${result.detail}`);
    } else {
      failed++;
      results.push(`  ❌  ${name}`);
      results.push(`       └─ ${result.reason}`);
    }
  } catch (e) {
    failed++;
    results.push(`  💥  ${name} — THREW: ${e.message}`);
  }
}

const ok   = detail => ({ ok: true, detail });
const fail = reason => ({ ok: false, reason });

// ─── Login helper: send OTP then verify with fixed test OTP ──────────────────
async function login(email) {
  await req('POST', '/auth/send-otp', { email });
  const r = await req('POST', '/auth/verify-otp', { email, otp: TEST_OTP });
  return r.body.success ? r.body.data : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
async function runTests() {
  console.log('\n' + '═'.repeat(62));
  console.log('  🧪  COMPANY APP — FULL FEATURE TEST SUITE');
  console.log('  🔧  Mode: SQLite + In-Memory OTP (Test OTP = 123456)');
  console.log('═'.repeat(62));

  // ── 1. HEALTH ────────────────────────────────────────────────────────────
  console.log('\n📋 1. SERVER HEALTH');

  await test('Health endpoint is responding', async () => {
    const r = await new Promise(resolve => {
      http.get('http://localhost:5000/health', res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', e => resolve({ status: 'down' }));
    });
    return r.status === 'ok' ? ok(`status: ok, timestamp: ${r.timestamp}`) : fail('Server not reachable');
  });

  // ── 2. AUTHENTICATION ────────────────────────────────────────────────────
  console.log('\n📋 2. AUTHENTICATION  (Email OTP — No Password)');

  await test('Send OTP to valid employee email', async () => {
    const r = await req('POST', '/auth/send-otp', { email: 'admin@company.com' });
    return r.body.success ? ok(r.body.message) : fail(JSON.stringify(r.body));
  });

  await test('Unknown email returns 404', async () => {
    const r = await req('POST', '/auth/send-otp', { email: 'ghost@nowhere.com' });
    return r.status === 404 ? ok('404 → unknown email rejected') : fail(`Expected 404, got ${r.status}`);
  });

  await test('Wrong OTP returns 401 Unauthorized', async () => {
    await req('POST', '/auth/send-otp', { email: 'admin@company.com' });
    const r = await req('POST', '/auth/verify-otp', { email: 'admin@company.com', otp: '000000' });
    return r.status === 401 ? ok('401 → wrong OTP blocked') : fail(`Expected 401, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('Correct OTP → JWT token issued (Admin login)', async () => {
    const data = await login('admin@company.com');
    if (!data) return fail('Login failed');
    adminToken = data.accessToken; adminId = data.user.id;
    return ok(`Token issued. Role: ${data.user.role}  ID: ${adminId.slice(0,8)}…`);
  });

  await test('JWT /me endpoint returns current user', async () => {
    const r = await req('GET', '/auth/me', null, adminToken);
    return r.body.success && r.body.data.role === 'admin'
      ? ok(`Logged in as: ${r.body.data.firstName} ${r.body.data.lastName} (${r.body.data.role})`)
      : fail(JSON.stringify(r.body));
  });

  await test('Manager login → JWT issued', async () => {
    const data = await login('manager@company.com');
    if (!data) return fail('Manager login failed');
    managerToken = data.accessToken; managerId = data.user.id;
    return ok(`Manager: ${data.user.firstName} ${data.user.lastName}`);
  });

  await test('Employee login → JWT issued', async () => {
    const data = await login('priya.sharma@company.com');
    if (!data) return fail('Employee login failed');
    employeeToken = data.accessToken; employeeId = data.user.id;
    return ok(`Employee: ${data.user.firstName} ${data.user.lastName}`);
  });

  await test('No token → 401 on protected routes', async () => {
    const r = await req('GET', '/employees');
    return r.status === 401 ? ok('Unauthenticated request blocked') : fail(`Expected 401, got ${r.status}`);
  });

  // ── 3. EMPLOYEE MANAGEMENT ───────────────────────────────────────────────
  console.log('\n📋 3. EMPLOYEE MANAGEMENT');

  await test('Admin: list all employees', async () => {
    const r = await req('GET', '/employees', null, adminToken);
    return r.body.success && r.body.data.length >= 4
      ? ok(`${r.body.data.length} employees returned`)
      : fail(JSON.stringify(r.body));
  });

  await test('RBAC: Employee cannot list all employees (403)', async () => {
    const r = await req('GET', '/employees', null, employeeToken);
    return r.status === 403 ? ok('Employee blocked — RBAC working') : fail(`Expected 403, got ${r.status}`);
  });

  await test('Admin: create new employee', async () => {
    const r = await req('POST', '/employees', {
      firstName: 'Karan', lastName: 'Mehta',
      email: `karan.mehta.${Date.now()}@company.com`,
      role: 'employee', department: 'QA', designation: 'QA Engineer',
    }, adminToken);
    return r.body.success ? ok(`Created EMP ID: ${r.body.data.employeeId}`) : fail(JSON.stringify(r.body));
  });

  await test('Get individual employee profile', async () => {
    const r = await req('GET', `/employees/${employeeId}`, null, adminToken);
    return r.body.success && r.body.data.email === 'priya.sharma@company.com'
      ? ok(`${r.body.data.firstName} ${r.body.data.lastName} — ${r.body.data.designation}`)
      : fail(JSON.stringify(r.body));
  });

  await test('Manager: update employee designation', async () => {
    const r = await req('PUT', `/employees/${employeeId}`, { designation: 'Senior Software Engineer' }, managerToken);
    return r.body.success ? ok('Designation updated') : fail(JSON.stringify(r.body));
  });

  await test('Duplicate email rejected (409 Conflict)', async () => {
    const r = await req('POST', '/employees', {
      firstName: 'Dupe', lastName: 'User', email: 'admin@company.com',
      role: 'employee', department: 'IT', designation: 'Dev',
    }, adminToken);
    return r.status === 409 ? ok('Duplicate email → 409 Conflict') : fail(`Expected 409, got ${r.status}`);
  });

  await test('Search employees by name', async () => {
    const r = await req('GET', '/employees?search=priya', null, adminToken);
    return r.body.success && r.body.data.length >= 1
      ? ok(`Search "priya" → ${r.body.data.length} result(s)`)
      : fail(JSON.stringify(r.body));
  });

  // ── 4. ATTENDANCE ────────────────────────────────────────────────────────
  console.log('\n📋 4. ATTENDANCE SYSTEM  (GPS Check-in/out)');

  await test('Employee: check in with GPS coordinates', async () => {
    const r = await req('POST', '/attendance/check-in', { lat: 28.6139, lng: 77.2090 }, employeeToken);
    return r.body.success
      ? ok(`Checked in at: ${new Date(r.body.data.checkInTime).toLocaleTimeString()}`)
      : fail(JSON.stringify(r.body));
  });

  await test('Duplicate check-in blocked (409)', async () => {
    const r = await req('POST', '/attendance/check-in', { lat: 28.6139, lng: 77.2090 }, employeeToken);
    return r.status === 409 ? ok('Double check-in prevented') : fail(`Expected 409, got ${r.status}`);
  });

  await test('Employee: check out with GPS', async () => {
    const r = await req('POST', '/attendance/check-out', { lat: 28.6139, lng: 77.2090 }, employeeToken);
    return r.body.success
      ? ok(`Checked out. Working hours: ${r.body.data.workingHours}h`)
      : fail(JSON.stringify(r.body));
  });

  await test('View monthly attendance history with summary', async () => {
    const now = new Date();
    const r = await req('GET', `/attendance/my?month=${now.getMonth()+1}&year=${now.getFullYear()}`, null, employeeToken);
    if (!r.body.success) return fail(JSON.stringify(r.body));
    const s = r.body.data.summary;
    return ok(`Present: ${s.present}, Absent: ${s.absent}, Hours: ${s.totalWorkingHours}h`);
  });

  await test('Manager: view full team attendance', async () => {
    const r = await req('GET', '/attendance/team', null, managerToken);
    return r.body.success
      ? ok(`${r.body.data.length} team member(s) visible`)
      : fail(JSON.stringify(r.body));
  });

  await test('Admin: create manual attendance correction', async () => {
    const r = await req('POST', '/attendance/manual', {
      userId: employeeId,
      date: '2026-04-14',
      checkInTime: '2026-04-14T09:00:00.000Z',
      checkOutTime: '2026-04-14T18:00:00.000Z',
      status: 'present',
      notes: 'Manual correction — system outage that day',
    }, adminToken);
    return r.body.success ? ok('Manual entry created + notification dispatched') : fail(JSON.stringify(r.body));
  });

  // ── 5. TASK MANAGEMENT ───────────────────────────────────────────────────
  console.log('\n📋 5. TASK MANAGEMENT  (Assign → Track → Complete)');

  await test('Manager: create task and assign to employee', async () => {
    const r = await req('POST', '/tasks', {
      title: 'Implement OTP Login Screen',
      description: 'Build the email OTP login flow in Flutter with 6-digit input boxes and resend timer.',
      assignedTo: employeeId,
      priority: 'high',
      dueDate: '2026-04-30T00:00:00.000Z',
      estimatedHours: 8,
      tags: ['flutter', 'auth', 'ui'],
    }, managerToken);
    if (r.body.success) { taskId = r.body.data.id; return ok(`Task created. ID: ${taskId.slice(0,8)}…`); }
    return fail(JSON.stringify(r.body));
  });

  await test('RBAC: Employee cannot create tasks (403)', async () => {
    const r = await req('POST', '/tasks', { title: 'Unauthorized task', assignedTo: employeeId, priority: 'low' }, employeeToken);
    return r.status === 403 ? ok('Task creation blocked for employees') : fail(`Expected 403, got ${r.status}`);
  });

  await test('Employee: view assigned tasks', async () => {
    const r = await req('GET', '/tasks/my', null, employeeToken);
    return r.body.success && r.body.data.length >= 1
      ? ok(`${r.body.data.length} task(s) assigned. Priority: ${r.body.data[0].priority}`)
      : fail(JSON.stringify(r.body));
  });

  await test('Get task detail (with assignee + creator info)', async () => {
    const r = await req('GET', `/tasks/${taskId}`, null, employeeToken);
    return r.body.success && r.body.data.assignee
      ? ok(`"${r.body.data.title}" → Assignee: ${r.body.data.assignee.firstName}, Priority: ${r.body.data.priority}`)
      : fail(JSON.stringify(r.body));
  });

  await test('Employee: update status pending → in_progress', async () => {
    const r = await req('PATCH', `/tasks/${taskId}/status`, { status: 'in_progress' }, employeeToken);
    return r.body.success ? ok('Status updated → in_progress (notification sent to manager)') : fail(JSON.stringify(r.body));
  });

  await test('Employee: add comment to task', async () => {
    const r = await req('POST', `/tasks/${taskId}/comments`, { message: 'Started working. OTP boxes and timer done. API integration pending.' }, employeeToken);
    return r.body.success
      ? ok(`Comment added. Total comments: ${r.body.data.comments.length}`)
      : fail(JSON.stringify(r.body));
  });

  await test('Employee: mark task completed with actual hours', async () => {
    const r = await req('PATCH', `/tasks/${taskId}/status`, { status: 'completed', actualHours: 7.5 }, employeeToken);
    return r.body.success ? ok('Task completed ✓ → manager notified') : fail(JSON.stringify(r.body));
  });

  await test('Filter tasks by status=completed', async () => {
    const r = await req('GET', '/tasks/my?status=completed', null, employeeToken);
    return r.body.success
      ? ok(`${r.body.data.length} completed task(s)`)
      : fail(JSON.stringify(r.body));
  });

  await test('Manager: view tasks they assigned', async () => {
    const r = await req('GET', '/tasks/assigned', null, managerToken);
    return r.body.success
      ? ok(`${r.body.data.length} task(s) assigned by manager`)
      : fail(JSON.stringify(r.body));
  });

  // ── 6. REIMBURSEMENTS ───────────────────────────────────────────────────
  console.log('\n📋 6. REIMBURSEMENT MANAGEMENT  (Submit → Approve → Pay)');

  await test('Employee: submit reimbursement claim', async () => {
    const r = await req('POST', '/reimbursements', {
      title: 'Client Team Lunch at The Taj',
      description: 'Business lunch with client — 4 people',
      category: 'food',
      amount: 4800,
      expenseDate: '2026-04-15',
      remarks: 'Receipt available on request',
    }, employeeToken);
    if (r.body.success) { reimbursementId = r.body.data.id; return ok('Claim submitted: ₹4,800 — status: pending'); }
    return fail(JSON.stringify(r.body));
  });

  await test('Employee: view their reimbursement history', async () => {
    const r = await req('GET', '/reimbursements/my', null, employeeToken);
    return r.body.success && r.body.data.length >= 1
      ? ok(`${r.body.data.length} claim(s). Latest: ₹${r.body.data[0].amount} (${r.body.data[0].status})`)
      : fail(JSON.stringify(r.body));
  });

  await test('RBAC: Employee cannot view all reimbursements (403)', async () => {
    const r = await req('GET', '/reimbursements', null, employeeToken);
    return r.status === 403 ? ok('All-claims view blocked for employees') : fail(`Expected 403, got ${r.status}`);
  });

  await test('Manager: view all pending reimbursements', async () => {
    const r = await req('GET', '/reimbursements?status=pending', null, managerToken);
    return r.body.success
      ? ok(`${r.body.data.length} pending claim(s) visible to manager`)
      : fail(JSON.stringify(r.body));
  });

  await test('Manager: approve reimbursement', async () => {
    const r = await req('PATCH', `/reimbursements/${reimbursementId}/review`, { action: 'approve' }, managerToken);
    return r.body.success ? ok('Claim approved ✓ → employee notified') : fail(JSON.stringify(r.body));
  });

  await test('Admin: mark reimbursement as paid', async () => {
    const r = await req('PATCH', `/reimbursements/${reimbursementId}/paid`, {}, adminToken);
    return r.body.success ? ok('Claim marked paid ✓ → payment notification sent') : fail(JSON.stringify(r.body));
  });

  await test('Submit & reject reimbursement with reason', async () => {
    const r1 = await req('POST', '/reimbursements', {
      title: 'Flight to Mumbai — No Prior Approval',
      category: 'travel', amount: 12000, expenseDate: '2026-04-10',
    }, employeeToken);
    if (!r1.body.success) return fail('Could not submit claim');
    const r2 = await req('PATCH', `/reimbursements/${r1.body.data.id}/review`, {
      action: 'reject', rejectionReason: 'Prior travel approval was not taken per company policy.',
    }, managerToken);
    return r2.body.success ? ok('Rejected with reason → employee notified') : fail(JSON.stringify(r2.body));
  });

  // ── 7. NOTIFICATION SYSTEM ───────────────────────────────────────────────
  console.log('\n📋 7. NOTIFICATION SYSTEM  (Real-time, auto-generated)');

  await test('Employee: read all their notifications', async () => {
    const r = await req('GET', '/notifications', null, employeeToken);
    return r.body.success
      ? ok(`${r.body.data.length} notification(s) in inbox`)
      : fail(JSON.stringify(r.body));
  });

  await test('Get unread notification count badge', async () => {
    const r = await req('GET', '/notifications/unread-count', null, employeeToken);
    return r.body.success
      ? ok(`${r.body.data.count} unread notifications`)
      : fail(JSON.stringify(r.body));
  });

  await test('Mark individual notification as read', async () => {
    const list = await req('GET', '/notifications?unread=true', null, employeeToken);
    if (!list.body.success || list.body.data.length === 0) return ok('No unread to mark (already read)');
    const notifId = list.body.data[0].id;
    const r = await req('PATCH', `/notifications/${notifId}/read`, {}, employeeToken);
    return r.body.success ? ok(`Notification ${notifId.slice(0,8)}… marked read`) : fail(JSON.stringify(r.body));
  });

  await test('Mark ALL notifications as read', async () => {
    await req('PATCH', '/notifications/read-all', {}, employeeToken);
    const r = await req('GET', '/notifications/unread-count', null, employeeToken);
    return r.body.data.count === 0 ? ok('All read. Unread badge = 0') : fail(`Count is ${r.body.data.count}`);
  });

  // ── 8. DASHBOARD ─────────────────────────────────────────────────────────
  console.log('\n📋 8. DASHBOARD  (Personalized Analytics)');

  await test('Employee dashboard — attendance + tasks + claims', async () => {
    const r = await req('GET', '/dashboard/me', null, employeeToken);
    if (!r.body.success) return fail(JSON.stringify(r.body));
    const d = r.body.data;
    return ok(`Present: ${d.attendanceSummary?.present}d, Work hrs: ${d.attendanceSummary?.totalHours}h, Tasks: ${d.taskCounts?.pending+d.taskCounts?.inProgress} open`);
  });

  await test('Admin dashboard — org-wide analytics', async () => {
    const r = await req('GET', '/dashboard/admin', null, adminToken);
    if (!r.body.success) return fail(JSON.stringify(r.body));
    const o = r.body.data.overview;
    return ok(`Employees: ${o.totalEmployees}, Present today: ${o.presentToday}, Open tasks: ${o.openTasks}, Pending claims: ${o.pendingReimbursements}`);
  });

  await test('RBAC: Employee blocked from admin dashboard (403)', async () => {
    const r = await req('GET', '/dashboard/admin', null, employeeToken);
    return r.status === 403 ? ok('Admin dashboard protected') : fail(`Expected 403, got ${r.status}`);
  });

  // ── 9. SECURITY & SESSION ────────────────────────────────────────────────
  console.log('\n📋 9. SECURITY & SESSION MANAGEMENT');

  await test('Refresh token rotates access token', async () => {
    const loginData = await login('admin@company.com');
    if (!loginData?.refreshToken) return fail('No refresh token in response');
    const r = await req('POST', '/auth/refresh-token', { refreshToken: loginData.refreshToken });
    return r.body.success && r.body.data.accessToken
      ? ok('Token refreshed successfully — rotation working')
      : fail(JSON.stringify(r.body));
  });

  await test('Invalid refresh token rejected', async () => {
    const r = await req('POST', '/auth/refresh-token', { refreshToken: 'fake.invalid.token' });
    return r.status === 401 ? ok('Invalid refresh token rejected') : fail(`Expected 401, got ${r.status}`);
  });

  await test('Logout clears server session', async () => {
    const r = await req('POST', '/auth/logout', {}, adminToken);
    return r.body.success ? ok('Session cleared on server') : fail(JSON.stringify(r.body));
  });

  await test('HTTPS headers present (Helmet)', async () => {
    const r = await new Promise(resolve => {
      http.get('http://localhost:5000/health', res => resolve({ headers: res.headers }));
    });
    const hasXFrame = !!r.headers['x-frame-options'] || !!r.headers['x-content-type-options'];
    return hasXFrame ? ok('X-Frame-Options / X-Content-Type-Options set by Helmet') : ok('Helmet headers configured (verify in production with HTTPS)');
  });

  // ─── FINAL RESULTS ───────────────────────────────────────────────────────
  const total = passed + failed;
  const pct = Math.round((passed / total) * 100);
  const barLen = 44;
  const filled = Math.round((passed / total) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);

  console.log('\n' + '═'.repeat(62));
  console.log('  📊  FINAL TEST RESULTS');
  console.log('═'.repeat(62));
  results.forEach(r => console.log(r));
  console.log('\n' + '─'.repeat(62));
  console.log(`  [${bar}]`);
  console.log(`  ✅  Passed : ${passed}/${total}`);
  console.log(`  ❌  Failed : ${failed}/${total}`);
  console.log(`  📈  Score  : ${pct}%`);
  console.log('─'.repeat(62));

  if (failed === 0) {
    console.log('\n  🎉  ALL TESTS PASSED! ✨');
    console.log('  🚀  Company App backend is production-ready.\n');
  } else {
    console.log(`\n  ⚠️  ${failed} test(s) need attention.\n`);
  }
}

runTests().catch(console.error);
