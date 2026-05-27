const { Attendance, User } = require('../models');
const { success, error, paginated } = require('../utils/response');
const { createNotification } = require('../services/notification.service');
const { Op } = require('sequelize');
const moment = require('moment');

exports.checkIn = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = moment().format('YYYY-MM-DD');

    const existing = await Attendance.findOne({ where: { userId, date: today } });
    if (existing?.checkInTime) return error(res, 'Already checked in today', 409);

    const location = {
      lat: req.body.lat,
      lng: req.body.lng,
      ip: req.ip,
    };

    let record;
    if (existing) {
      record = await existing.update({ checkInTime: new Date(), checkInLocation: location, status: 'present' });
    } else {
      record = await Attendance.create({
        userId, date: today, checkInTime: new Date(),
        checkInLocation: location, status: 'present',
      });
    }

    return success(res, { checkInTime: record.checkInTime }, 'Checked in successfully');
  } catch (err) {
    next(err);
  }
};

exports.checkOut = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = moment().format('YYYY-MM-DD');

    const record = await Attendance.findOne({ where: { userId, date: today } });
    if (!record?.checkInTime) return error(res, 'Please check in first', 400);
    if (record.checkOutTime) return error(res, 'Already checked out today', 409);

    const checkOut = new Date();
    const workingHours = moment(checkOut).diff(moment(record.checkInTime), 'hours', true);
    const status = workingHours >= 4 && workingHours < 8 ? 'half_day' : 'present';

    const location = { lat: req.body.lat, lng: req.body.lng, ip: req.ip };
    await record.update({ checkOutTime: checkOut, checkOutLocation: location, workingHours, status });

    return success(res, { checkOutTime: checkOut, workingHours: workingHours.toFixed(2) }, 'Checked out successfully');
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
