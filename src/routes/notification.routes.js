const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { Notification } = require('../models');
const { success, paginated } = require('../utils/response');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unread } = req.query;
    const offset = (page - 1) * limit;
    const where = { userId: req.user.id };
    if (unread === 'true') where.isRead = false;

    const { count, rows } = await Notification.findAndCountAll({
      where, limit: parseInt(limit), offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
    });

    return paginated(res, rows, count, page, limit);
  } catch (err) { next(err); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    await Notification.update(
      { isRead: true, readAt: new Date() },
      { where: { id: req.params.id, userId: req.user.id } }
    );
    return success(res, {}, 'Marked as read');
  } catch (err) { next(err); }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    await Notification.update(
      { isRead: true, readAt: new Date() },
      { where: { userId: req.user.id, isRead: false } }
    );
    return success(res, {}, 'All notifications marked as read');
  } catch (err) { next(err); }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    const count = await Notification.count({ where: { userId: req.user.id, isRead: false } });
    return success(res, { count });
  } catch (err) { next(err); }
});

module.exports = router;
