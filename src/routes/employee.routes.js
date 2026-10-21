const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { uploadSingle, handleUploadError } = require('../middleware/upload.middleware');
const ctrl = require('../controllers/employee.controller');

router.use(authenticate);

router.get('/', authorize('super_admin', 'admin', 'manager'), ctrl.getAllEmployees);
router.post('/', authorize('super_admin', 'admin'), ctrl.createEmployee);
router.get('/:id', ctrl.getEmployee);
router.put('/:id', authorize('super_admin', 'admin', 'manager'), ctrl.updateEmployee);
router.delete('/:id/deactivate', authorize('super_admin', 'admin'), ctrl.deactivateEmployee);
router.post('/:id/photo', uploadSingle('photo', 'images'), handleUploadError, ctrl.uploadProfilePhoto);

module.exports = router;
