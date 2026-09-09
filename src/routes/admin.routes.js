const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/admin.controller');

// Everything here is SUPER ADMIN only.
router.use(authenticate, authorize('super_admin'));

router.get('/users', ctrl.listUsers);
router.post('/users', ctrl.createUser);
router.patch('/users/:id', ctrl.updateUser);
router.get('/users/:id/password', ctrl.viewPassword);
router.post('/users/:id/archive', ctrl.archiveUser);
router.post('/users/:id/unarchive', ctrl.unarchiveUser);

module.exports = router;
