const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/dashboard.controller');

router.use(authenticate);

router.get('/me', ctrl.getEmployeeDashboard);
router.get('/admin', authorize('admin', 'manager'), ctrl.getAdminDashboard);

module.exports = router;
