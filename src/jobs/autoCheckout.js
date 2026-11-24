/**
 * Auto check-out.
 *
 * People check in and then forget to check out, which leaves the day open and
 * makes the hours total wrong. At the end of the working day every open
 * attendance is closed at a fixed time.
 *
 * Only Monday–Saturday: Sunday check-ins are usually field work and are left
 * alone for a human to close.
 *
 * No scheduler library — a plain interval that asks "is it past the cut-off
 * and have I already run for this date?" survives restarts, which a one-shot
 * timer would not.
 */
const { Op } = require('sequelize');
const { Attendance } = require('../models');
const { createNotification } = require('../services/notification.service');
const logger = require('../utils/logger');

// Company clock. The server runs in UTC; India is +5:30.
const OFFSET_MINUTES = Number(process.env.REPORT_UTC_OFFSET_MINUTES ?? 330);
// "HH:mm" in company time. 18:30 = 6:30 pm: the end of the working day, and
// the time a day is recorded as ending.
const CUTOFF = String(process.env.AUTO_CHECKOUT_TIME || '18:30');
// People are asked to check out themselves first, and only what is still open
// after the grace period is closed for them. The recorded time is the cut-off
// either way, so the hours are the same.
const GRACE_MINUTES = Number(process.env.AUTO_CHECKOUT_GRACE_MINUTES ?? 60);
const CHECK_EVERY_MS = 5 * 60 * 1000;

/** The same wall-clock moment, expressed in company time. */
function companyNow(now = new Date()) {
  return new Date(now.getTime() + OFFSET_MINUTES * 60 * 1000);
}

function cutoffParts() {
  const [h, m] = CUTOFF.split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 18, minute: Number.isFinite(m) ? m : 30 };
}

/** yyyy-mm-dd for a company-time date. */
function dateKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Sunday is day 0 in company time. */
function isWorkingDay(companyDate) {
  return companyDate.getUTCDay() !== 0;
}

/** Minutes since the cut-off on the company clock; negative before it. */
function minutesPastCutoff(companyDate) {
  const { hour, minute } = cutoffParts();
  const mins = companyDate.getUTCHours() * 60 + companyDate.getUTCMinutes();
  return mins - (hour * 60 + minute);
}

/** Has the company clock passed the cut-off for its own date? */
function pastCutoff(companyDate) {
  return minutesPastCutoff(companyDate) >= 0;
}

/** The real UTC instant of the cut-off on a given company date. */
function cutoffInstant(companyDate) {
  const { hour, minute } = cutoffParts();
  const atCompany = Date.UTC(
    companyDate.getUTCFullYear(), companyDate.getUTCMonth(), companyDate.getUTCDate(),
    hour, minute, 0, 0,
  );
  return new Date(atCompany - OFFSET_MINUTES * 60 * 1000);
}

/**
 * Close every attendance for `date` that was checked in and never checked out.
 * Returns how many were closed. Safe to call repeatedly: rows that already
 * have a check-out are not touched.
 */
async function closeOpenDay(date, closeAt) {
  const open = await Attendance.findAll({
    where: {
      date,
      checkInTime: { [Op.ne]: null },
      checkOutTime: { [Op.is]: null },
    },
  });

  let closed = 0;
  for (const row of open) {
    const checkIn = new Date(row.checkInTime);
    // Never invent a negative day. If someone checked in after the cut-off,
    // leave the row open rather than record nonsense.
    if (!(closeAt > checkIn)) continue;

    const hours = Number(((closeAt - checkIn) / 3600000).toFixed(2));
    const note = `Auto checked out at ${CUTOFF}`;
    await row.update({
      checkOutTime: closeAt,
      workingHours: hours,
      notes: row.notes ? `${row.notes} · ${note}` : note,
    });
    closed += 1;
  }
  return closed;
}

/**
 * Ask everyone still checked in to check out. Returns how many were asked.
 */
async function remindOpenDay(date) {
  const open = await Attendance.findAll({
    where: { date, checkInTime: { [Op.ne]: null }, checkOutTime: { [Op.is]: null } },
    attributes: ['userId'],
  });
  for (const row of open) {
    await createNotification(
      row.userId,
      'Please check out',
      `It is past ${CUTOFF}. Open the app and tap Check Out to close your day.`,
      'attendance',
    );
  }
  return open.length;
}

let lastRunDate = null;
let lastReminderDate = null;

/**
 * One tick. After the cut-off everyone still open is asked to check out; once
 * the grace period is up, whatever is still open is closed at the cut-off.
 */
async function tick(now = new Date()) {
  const company = companyNow(now);
  const key = dateKey(company);
  if (!isWorkingDay(company)) return { reminded: 0, closed: 0 };

  const past = minutesPastCutoff(company);
  let reminded = 0;
  let closed = 0;

  if (past >= 0 && lastReminderDate !== key) {
    reminded = await remindOpenDay(key);
    lastReminderDate = key;
    if (reminded > 0) logger.info(`Check-out reminder sent to ${reminded} member(s) for ${key}`);
  }

  if (past >= GRACE_MINUTES && lastRunDate !== key) {
    closed = await closeOpenDay(key, cutoffInstant(company));
    lastRunDate = key;
    if (closed > 0) logger.info(`Auto check-out: closed ${closed} open row(s) for ${key} at ${CUTOFF}`);
  }

  return { reminded, closed };
}

function start() {
  tick().catch((e) => logger.error(`Auto check-out failed: ${e.message}`));
  const timer = setInterval(
    () => tick().catch((e) => logger.error(`Auto check-out failed: ${e.message}`)),
    CHECK_EVERY_MS,
  );
  timer.unref?.();
  logger.info(`Check-out reminder at ${CUTOFF}, auto close ${GRACE_MINUTES} min later (Mon–Sat, UTC${OFFSET_MINUTES >= 0 ? '+' : ''}${OFFSET_MINUTES / 60}h)`);
}

module.exports = {
  start,
  tick,
  closeOpenDay,
  remindOpenDay,
  // exported for the self-check below
  _internals: { companyNow, isWorkingDay, pastCutoff, minutesPastCutoff, cutoffInstant, dateKey },
};

// ── Self-check ───────────────────────────────────────────────────────────────
// Run this file directly to prove the clock logic: node src/jobs/autoCheckout.js
if (require.main === module) {
  const assert = require('assert');
  const { companyNow, isWorkingDay, pastCutoff, minutesPastCutoff, cutoffInstant, dateKey } = module.exports._internals;

  // 2026-11-24 is a Tuesday. 13:00 UTC is 18:30 in India.
  const beforeCut = companyNow(new Date('2026-11-24T12:59:00Z'));
  const afterCut = companyNow(new Date('2026-11-24T13:00:00Z'));
  assert.strictEqual(dateKey(beforeCut), '2026-11-24');
  assert.strictEqual(pastCutoff(beforeCut), false, '12:59 UTC is 18:29 — too early');
  assert.strictEqual(pastCutoff(afterCut), true, '13:00 UTC is 18:30 — time to close');

  // Late evening UTC is already the next day in India.
  const lateUtc = companyNow(new Date('2026-11-24T19:00:00Z'));
  assert.strictEqual(dateKey(lateUtc), '2026-11-25', '00:30 IST belongs to the 25th');

  // Sunday is skipped; Saturday is a working day.
  assert.strictEqual(isWorkingDay(companyNow(new Date('2026-11-22T13:00:00Z'))), false, 'Sunday');
  assert.strictEqual(isWorkingDay(companyNow(new Date('2026-11-21T13:00:00Z'))), true, 'Saturday');

  // The cut-off maps back to the right real instant.
  assert.strictEqual(cutoffInstant(afterCut).toISOString(), '2026-11-24T13:00:00.000Z');

  // A 10:04 IST check-in closed at 18:30 IST is 8.43 hours.
  const checkIn = new Date('2026-11-24T04:34:00Z');
  const hours = Number(((cutoffInstant(afterCut) - checkIn) / 3600000).toFixed(2));
  assert.strictEqual(hours, 8.43);

  // The reminder fires at the cut-off; closing waits a full hour longer.
  assert.strictEqual(minutesPastCutoff(afterCut), 0, 'reminder time');
  assert.strictEqual(minutesPastCutoff(companyNow(new Date('2026-11-24T14:00:00Z'))), 60, 'close time');
  assert.ok(minutesPastCutoff(beforeCut) < 0, 'nothing happens before 18:30');

  console.log('auto check-out self-check passed');
}
