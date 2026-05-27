const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { uploadSingle, handleUploadError } = require('../middleware/upload.middleware');
const ctrl = require('../controllers/document.controller');

router.use(authenticate);

router.post('/', uploadSingle('file'), handleUploadError, ctrl.uploadDocument);
router.get('/my', ctrl.getMyDocuments);
router.get('/employee/:userId', authorize('admin', 'manager'), ctrl.getEmployeeDocuments);
router.get('/:id/download', ctrl.getDocumentDownloadUrl);
router.delete('/:id', ctrl.deleteDocument);
router.patch('/:id/verify', authorize('admin'), ctrl.verifyDocument);

module.exports = router;
