const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { uploadMultiple, handleUploadError } = require('../middleware/upload.middleware');
const ctrl = require('../controllers/reimbursement.controller');

router.use(authenticate);

router.post('/', uploadMultiple('bills', 5), handleUploadError, ctrl.submitReimbursement);
router.get('/my', ctrl.getMyReimbursements);
router.get('/', authorize('admin', 'manager'), ctrl.getAllReimbursements);
router.patch('/:id/review', authorize('admin', 'manager'), ctrl.reviewReimbursement);
router.patch('/:id/paid', authorize('admin'), ctrl.markAsPaid);

module.exports = router;
