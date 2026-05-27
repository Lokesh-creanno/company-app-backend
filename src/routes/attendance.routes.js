const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/attendance.controller');

router.use(authenticate);

router.post('/check-in', ctrl.checkIn);
router.post('/check-out', ctrl.checkOut);
router.get('/my', ctrl.getMyAttendance);
router.get('/team', authorize('admin', 'manager'), ctrl.getTeamAttendance);
router.post('/manual', authorize('admin', 'manager'), ctrl.manualEntry);
router.get('/report', authorize('admin', 'manager'), ctrl.getAttendanceReport);

module.exports = router;
