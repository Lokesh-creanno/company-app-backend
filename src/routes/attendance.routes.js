const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/attendance.controller');

router.use(authenticate);

router.get('/office-config', ctrl.getOfficeConfig);
router.put('/office-config', authorize('super_admin'), ctrl.setOfficeConfig);
router.post('/check-in', ctrl.checkIn);
router.post('/check-out', ctrl.checkOut);
router.get('/my', ctrl.getMyAttendance);
router.get('/my/export', ctrl.exportMyAttendance);
router.get('/team', authorize('super_admin', 'admin', 'manager'), ctrl.getTeamAttendance);
router.post('/manual', authorize('super_admin', 'admin', 'manager'), ctrl.manualEntry);
router.get('/report', authorize('super_admin', 'admin', 'manager'), ctrl.getAttendanceReport);

module.exports = router;
