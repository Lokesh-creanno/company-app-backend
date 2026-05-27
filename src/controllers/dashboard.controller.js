const { User, Attendance, Task, Reimbursement } = require('../models');
const { success } = require('../utils/response');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const moment = require('moment');

exports.getEmployeeDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = moment().format('YYYY-MM-DD');
    const monthStart = moment().startOf('month').format('YYYY-MM-DD');
    const monthEnd = moment().endOf('month').format('YYYY-MM-DD');

    const [todayAttendance, monthAttendance, myTasks, myReimbursements] = await Promise.all([
      Attendance.findOne({ where: { userId, date: today } }),
      Attendance.findAll({ where: { userId, date: { [Op.between]: [monthStart, monthEnd] } } }),
      Task.findAll({ where: { assignedTo: userId, status: { [Op.in]: ['pending', 'in_progress'] } }, limit: 5, order: [['dueDate', 'ASC']] }),
      Reimbursement.findAll({ where: { userId, status: { [Op.in]: ['pending', 'under_review'] } }, limit: 5 }),
    ]);

    const attendanceSummary = {
      present: monthAttendance.filter(a => a.status === 'present').length,
      halfDay: monthAttendance.filter(a => a.status === 'half_day').length,
      absent: monthAttendance.filter(a => a.status === 'absent').length,
      totalHours: monthAttendance.reduce((acc, a) => acc + (a.workingHours || 0), 0).toFixed(1),
    };

    return success(res, {
      todayAttendance,
      attendanceSummary,
      pendingTasks: myTasks,
      pendingReimbursements: myReimbursements,
      taskCounts: {
        pending: myTasks.filter(t => t.status === 'pending').length,
        inProgress: myTasks.filter(t => t.status === 'in_progress').length,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getAdminDashboard = async (req, res, next) => {
  try {
    const today = moment().format('YYYY-MM-DD');
    const monthStart = moment().startOf('month').format('YYYY-MM-DD');
    const monthEnd = moment().endOf('month').format('YYYY-MM-DD');
    const isManager = req.user.role === 'manager';

    // For managers, scope to their team; for admins, see all
    const teamWhere = isManager ? { managerId: req.user.id, isActive: true } : { isActive: true, role: { [Op.ne]: 'admin' } };
    const teamIds = isManager
      ? (await User.findAll({ where: teamWhere, attributes: ['id'] })).map(u => u.id)
      : null;

    const attendanceWhere = { date: today, status: 'present' };
    const taskWhere = { status: { [Op.in]: ['pending', 'in_progress'] } };
    const claimWhere = { status: { [Op.in]: ['pending', 'under_review'] } };
    if (teamIds) {
      attendanceWhere.userId = { [Op.in]: teamIds };
      taskWhere.assignedTo = { [Op.in]: teamIds };
      claimWhere.userId = { [Op.in]: teamIds };
    }

    const [
      totalEmployees, activeToday, pendingReimbursements,
      openTasks, completedTasksMonth, reimbursementAmount
    ] = await Promise.all([
      isManager ? User.count({ where: teamWhere }) : User.count({ where: { isActive: true, role: { [Op.ne]: 'admin' } } }),
      Attendance.count({ where: attendanceWhere }),
      Reimbursement.count({ where: claimWhere }),
      Task.count({ where: taskWhere }),
      Task.count({ where: { ...taskWhere, status: 'completed', completedAt: { [Op.between]: [monthStart + 'T00:00:00', monthEnd + 'T23:59:59'] } } }),
      Reimbursement.sum('amount', { where: { status: 'approved', createdAt: { [Op.between]: [monthStart, monthEnd] } } }),
    ]);

    // Department-wise attendance today — query with alias so Flutter reads 'department' directly
    const deptAttendanceRaw = await Attendance.findAll({
      where: attendanceWhere,
      include: [{ model: User, as: 'employee', attributes: ['department'] }],
      attributes: [[sequelize.fn('COUNT', sequelize.col('Attendance.id')), 'count']],
      group: ['employee.department'],
      raw: true,
    });
    // Normalize: raw join returns key as "employee.department"
    const deptAttendance = deptAttendanceRaw.map(d => ({
      department: d['employee.department'] || d['department'] || 'Unknown',
      count: d['count'],
    }));

    return success(res, {
      overview: {
        totalEmployees,
        presentToday: activeToday,
        pendingReimbursements,
        openTasks,
        completedTasksThisMonth: completedTasksMonth,
        reimbursementAmountThisMonth: reimbursementAmount || 0,
      },
      departmentAttendance: deptAttendance,
    });
  } catch (err) {
    next(err);
  }
};
