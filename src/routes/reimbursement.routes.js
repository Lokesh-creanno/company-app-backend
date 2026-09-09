const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { uploadMultiple, handleUploadError } = require('../middleware/upload.middleware');
const ctrl = require('../controllers/reimbursement.controller');

router.use(authenticate);

// Member
router.post('/', uploadMultiple('bills', 10), handleUploadError, ctrl.submitReimbursement);
router.post('/:id/resubmit', ctrl.resubmitReimbursement);
router.get('/my', ctrl.getMyReimbursements);

// Approval queue (accounts sees pending_accounts; super_admin sees all)
router.get('/queue', authorize('accounts', 'super_admin'), ctrl.getQueue);

// Stage actions
router.patch('/:id/accounts', authorize('accounts', 'super_admin'), ctrl.accountsAction);
router.patch('/:id/superadmin', authorize('super_admin'), ctrl.superAdminAction);
router.patch('/:id/paid', authorize('accounts', 'super_admin'), ctrl.markAsPaid);

// Single (member sees own; accounts/super_admin see any)
router.get('/:id', ctrl.getReimbursement);

module.exports = router;
