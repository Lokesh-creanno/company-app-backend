const { Attendance, User, Setting } = require('../models');
const { success, error, paginated } = require('../utils/response');
const { createNotification } = require('../services/notification.service');
const { exportAttendanceExcel } = require('../services/export.service');
const { Op } = require('sequelize');
const moment = require('moment');

const OFFICE_KEY = 'office_geofence';
const LATE_HOUR = 10, LATE_MIN = 30; // on-time cutoff = 10:30 local

// Great-circle distance in metres.
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function getOffice() {
  const s = await Setting.findByPk(OFFICE_KEY);
  return s?.value || null; // { lat, lng, radius, label }
}

// GET /api/attendance/office-config — anyone signed in (app needs it to geofence)
exports.getOfficeConfig = async (req, res, next) => {
  try { return success(res, await getOffice()); } catch (err) { next(err); }
};

// PUT /api/attendance/office-config — super_admin sets office location + radius
exports.setOfficeConfig = async (req, res, next) => {
  try {
    const { lat, lng, radius, label } = req.body;
    if (lat == null || lng == null) return error(res, 'lat and lng are required', 400);
    const value = { lat: Number(lat), lng: Number(lng), radius: Number(radius) || 150, label: label || 'Office' };
    await Setting.upsert({ key: OFFICE_KEY, value });
    return success(res, value, 'Office location saved');
  } catch (err) { next(err); }
};

exports.checkIn = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = req.body.localDate || moment().format('YYYY-MM-DD');
    const mode = req.body.mode === 'field' ? 'field' : 'office';
    const { lat, lng, note } = req.body;

    const existing = await Attendance.findOne({ where: { userId, date: today } });
    if (existing?.checkInTime) return error(res, 'Already checked in today', 409);

    // Office mode must be inside the configured geofence.
    if (mode === 'office') {
      const office = await getOffice();
      if (!office) return error(res, 'Office location not set. Use Field check-in or ask a super admin to set the office.', 400);
      if (lat == null || lng == null) return error(res, 'Location required for office check-in. Enable location and try again.', 400);
      const dist = distanceMeters(Number(lat), Number(lng), office.lat, office.lng);
      if (dist > office.radius) {
        return error(res, `You are ${Math.round(dist)} m from ${office.label} (allowed ${office.radius} m). Use Field check-in if you're working off-site.`, 403);
      }
    }

    // Late = local clock past 10:30 (device sends localHour/localMinute).
    const lh = req.body.localHour != null ? Number(req.body.localHour) : moment().hour();
    const lm = req.body.localMinute != null ? Number(req.body.localMinute) : moment().minute();
    const isLate = lh > LATE_HOUR || (lh === LATE_HOUR && lm > LATE_MIN);

    const now = new Date();
    const location = { lat, lng, ip: req.ip, note: note || null };
    const base = {
      checkInTime: now, checkInLocation: location, status: 'present', mode, isLate,
      notes: note || null,
    };
    const record = existing ? await existing.update(base) : await Attendance.create({ userId, date: today, ...base });

    return success(res, {
      checkInTime: record.checkInTime, date: today, mode, isLate,
    }, mode === 'field' ? 'Field check-in recorded' : (isLate ? 'Checked in (late)' : 'Checked in — on time'));
  } catch (err) {
    next(err);
  }
};

exports.checkOut = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Use client-supplied local date to match the check-in record
    const today = req.body.localDate || moment().format('YYYY-MM-DD');

    const record = await Attendance.findOne({ where: { userId, date: today } });
    if (!record?.checkInTime) return error(res, 'Please check in first', 400);
    if (record.checkOutTime) return error(res, 'Already checked out today', 409);

    const checkOut = new Date();
    const workingHours = moment(checkOut).diff(moment(record.checkInTime), 'hours', true);
    // present = ≥8h, half_day = 4–8h, short = <4h (still mark present for short days)
    const status = workingHours >= 4 && workingHours < 8 ? 'half_day' : 'present';

    const location = { lat: req.body.lat, lng: req.body.lng, ip: req.ip };
    await record.update({ checkOutTime: checkOut, checkOutLocation: location, workingHours, status });

    return success(res, { checkOutTime: checkOut, workingHours: workingHours.toFixed(2), date: today }, 'Checked out successfully');
  } catch (err) {
    next(err);
  }
};

exports.getMyAttendance = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { month, year, page = 1, limit = 31 } = req.query;
    const offset = (page - 1) * limit;

    const where = { userId };
    if (month && year) {
      const startDate = moment(`${year}-${month}-01`).startOf('month').format('YYYY-MM-DD');
      const endDate = moment(`${year}-${month}-01`).endOf('month').format('YYYY-MM-DD');
      where.date = { [Op.between]: [startDate, endDate] };
    }

    const { count, rows } = await Attendance.findAndCountAll({
      where,
      order: [['date', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const summary = {
      present: rows.filter(r => r.status === 'present').length,
      absent: rows.filter(r => r.status === 'absent').length,
      halfDay: rows.filter(r => r.status === 'half_day').length,
      totalWorkingHours: rows.reduce((acc, r) => acc + (r.workingHours || 0), 0).toFixed(2),
    };

    return paginated(res, { records: rows, summary }, count, page, limit);
  } catch (err) {
    next(err);
  }
};

exports.getTeamAttendance = async (req, res, next) => {
  try {
    const { date = moment().format('YYYY-MM-DD'), department } = req.query;

    const userWhere = { isActive: true };
    if (req.user.role === 'manager') userWhere.managerId = req.user.id;
    if (department) userWhere.department = department;

    const employees = await User.findAll({ where: userWhere, attributes: ['id', 'firstName', 'lastName', 'employeeId', 'department'] });
    const empIds = employees.map(e => e.id);

    const records = await Attendance.findAll({ where: { userId: { [Op.in]: empIds }, date } });
    const recordMap = Object.fromEntries(records.map(r => [r.userId, r]));

    const data = employees.map(e => ({
      employee: e,
      attendance: recordMap[e.id] || { status: 'absent', date },
    }));

    return success(res, data);
  } catch (err) {
    next(err);
  }
};

exports.manualEntry = async (req, res, next) => {
  try {
    const { userId, date, checkInTime, checkOutTime, status, notes } = req.body;

    const [record, created] = await Attendance.findOrCreate({
      where: { userId, date },
      defaults: { checkInTime, checkOutTime, status, notes, isManualEntry: true, approvedBy: req.user.id },
    });

    if (!created) {
      await record.update({ checkInTime, checkOutTime, status, notes, isManualEntry: true, approvedBy: req.user.id });
    }

    await createNotification(userId, 'Attendance Updated', `Your attendance for ${date} has been updated by HR.`, 'attendance', record.id, 'Attendance');
    return success(res, {}, 'Attendance updated');
  } catch (err) {
    next(err);
  }
};

// Any logged-in user downloads their OWN month as Excel (dates + timings).
exports.exportMyAttendance = async (req, res, next) => {
  try {
    const m = req.query.month || moment().format('MM');
    const y = req.query.year || moment().format('YYYY');
    const start = moment(`${y}-${String(m).padStart(2, '0')}-01`).startOf('month').format('YYYY-MM-DD');
    const end = moment(start).endOf('month').format('YYYY-MM-DD');
    const buffer = await exportAttendanceExcel(start, end, req.user.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=my_attendance_${y}-${String(m).padStart(2, '0')}.xlsx`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
};

exports.getAttendanceReport = async (req, res, next) => {
  try {
    const { startDate, endDate, userId } = req.query;
    const where = {};
    if (startDate && endDate) where.date = { [Op.between]: [startDate, endDate] };
    if (userId) where.userId = userId;

    const records = await Attendance.findAll({
      where,
      include: [{ model: User, as: 'employee', attributes: ['id', 'firstName', 'lastName', 'employeeId', 'department'] }],
      order: [['date', 'DESC']],
    });

    return success(res, records);
  } catch (err) {
    next(err);
  }
};
