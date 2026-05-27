const { Reimbursement, User } = require('../models');
const { success, error, paginated } = require('../utils/response');
const { uploadFile, deleteFile } = require('../services/storage.service');
const { createNotification } = require('../services/notification.service');
const { Op } = require('sequelize');

exports.submitReimbursement = async (req, res, next) => {
  try {
    const { title, description, category, amount, currency, expenseDate, remarks } = req.body;

    let bills = [];
    if (req.files && req.files.length > 0) {
      bills = await Promise.all(
        req.files.map(f => uploadFile(f.buffer, f.originalname, 'reimbursements/bills', f.mimetype).then(r => r.url))
      );
    }

    const reimbursement = await Reimbursement.create({
      userId: req.user.id, title, description, category,
      amount, currency: currency || 'INR', expenseDate, bills, remarks,
    });

    // Notify manager
    const manager = await User.findOne({ where: { id: req.user.managerId, isActive: true } });
    if (manager) {
      await createNotification(manager.id, 'New Reimbursement Request', `${req.user.firstName} submitted a reimbursement of ₹${amount}.`, 'reimbursement', reimbursement.id, 'Reimbursement');
    }

    // Notify admins
    const admins = await User.findAll({ where: { role: 'admin', isActive: true } });
    await Promise.all(admins.map(a =>
      createNotification(a.id, 'New Reimbursement', `${req.user.firstName} submitted ₹${amount} reimbursement.`, 'reimbursement', reimbursement.id, 'Reimbursement')
    ));

    return success(res, { id: reimbursement.id }, 'Reimbursement submitted', 201);
  } catch (err) {
    next(err);
  }
};

exports.getMyReimbursements = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const where = { userId: req.user.id };
    if (status) where.status = status;

    const { count, rows } = await Reimbursement.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
    });

    return paginated(res, rows, count, page, limit);
  } catch (err) {
    next(err);
  }
};

exports.getAllReimbursements = async (req, res, next) => {
  try {
    const { status, userId, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const where = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const { count, rows } = await Reimbursement.findAndCountAll({
      where,
      include: [{ model: User, as: 'employee', attributes: ['id', 'firstName', 'lastName', 'employeeId', 'department'] }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
    });

    return paginated(res, rows, count, page, limit);
  } catch (err) {
    next(err);
  }
};

exports.reviewReimbursement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, rejectionReason } = req.body; // 'approve' | 'reject'

    const reimbursement = await Reimbursement.findByPk(id);
    if (!reimbursement) return error(res, 'Reimbursement not found', 404);
    if (!['pending', 'under_review'].includes(reimbursement.status)) return error(res, 'Cannot review in current status', 400);

    let status, notifTitle, notifBody;
    if (action === 'approve') {
      status = 'approved';
      notifTitle = 'Reimbursement Approved';
      notifBody = `Your reimbursement of ₹${reimbursement.amount} has been approved.`;
      await reimbursement.update({ status, approvedBy: req.user.id, approvedAt: new Date() });
    } else if (action === 'reject') {
      status = 'rejected';
      notifTitle = 'Reimbursement Rejected';
      notifBody = `Your reimbursement of ₹${reimbursement.amount} was rejected. Reason: ${rejectionReason}`;
      await reimbursement.update({ status, rejectionReason, reviewedBy: req.user.id, reviewedAt: new Date() });
    } else {
      return error(res, 'Invalid action', 400);
    }

    await createNotification(reimbursement.userId, notifTitle, notifBody, 'reimbursement', id, 'Reimbursement');
    return success(res, {}, `Reimbursement ${action}d`);
  } catch (err) {
    next(err);
  }
};

exports.markAsPaid = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reimbursement = await Reimbursement.findByPk(id);
    if (!reimbursement) return error(res, 'Not found', 404);
    if (reimbursement.status !== 'approved') return error(res, 'Must be approved before marking paid', 400);
    await reimbursement.update({ status: 'paid', paidAt: new Date() });
    await createNotification(reimbursement.userId, 'Reimbursement Paid', `₹${reimbursement.amount} has been transferred to your account.`, 'reimbursement', id, 'Reimbursement');
    return success(res, {}, 'Marked as paid');
  } catch (err) {
    next(err);
  }
};
