const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/task.controller');

router.use(authenticate);

router.post('/', authorize('admin', 'manager'), ctrl.createTask);
router.get('/my', ctrl.getMyTasks);
router.get('/assigned', authorize('admin', 'manager'), ctrl.getAssignedTasks);
router.get('/:id', ctrl.getTask);
router.patch('/:id/status', ctrl.updateTaskStatus);
router.post('/:id/comments', ctrl.addComment);
router.delete('/:id', ctrl.deleteTask);

module.exports = router;
