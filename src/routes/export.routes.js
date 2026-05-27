const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { exportAttendanceExcel, exportReimbursementExcel, generateAttendancePDF } = require('../services/export.service');
const { Attendance } = require('../models');
const { Op } = require('sequelize');

router.use(authenticate, authorize('admin', 'manager'));

// GET /api/export/attendance?startDate=&endDate=&format=excel|pdf
router.get('/attendance', async (req, res, next) => {
  try {
    const { startDate, endDate, userId, format = 'excel' } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate and endDate required' });

    if (format === 'pdf') {
      const records = await Attendance.findAll({
        where: { date: { [Op.between]: [startDate, endDate] }, ...(userId ? { userId } : {}) },
        include: [{ model: require('../models').User, as: 'employee', attributes: ['employeeId', 'firstName', 'lastName', 'department'] }],
        order: [['date', 'ASC']],
      });
      const pdf = await generateAttendancePDF(records, { startDate, endDate });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=attendance_${startDate}_${endDate}.pdf`);
      return res.send(pdf);
    }

    const buffer = await exportAttendanceExcel(startDate, endDate, userId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_${startDate}_${endDate}.xlsx`);
    return res.send(buffer);
  } catch (err) { next(err); }
});

// GET /api/export/reimbursements?startDate=&endDate=
router.get('/reimbursements', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate and endDate required' });

    const buffer = await exportReimbursementExcel(startDate, endDate);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reimbursements_${startDate}_${endDate}.xlsx`);
    return res.send(buffer);
  } catch (err) { next(err); }
});

module.exports = router;
