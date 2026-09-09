const { Reimbursement, User } = require('../models');
const { success, error, paginated } = require('../utils/response');
const { uploadFile } = require('../services/storage.service');
const { createNotification } = require('../services/notification.service');
const { Op } = require('sequelize');
const moment = require('moment');

const SLA_DAYS = 5; // each approval stage is time-bound to 5 days

function slaDeadline() {
  return moment().add(SLA_DAYS, 'days').toDate();
}

// Sum of line-item amounts (the calculator, server-side = source of truth).
function totalOf(items) {
  return (items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
}

// Attach computed fields the client/report needs.
function decorate(r) {
  const j = r.toJSON ? r.toJSON() : r;
  const overdue = ['pending_accounts', 'pending_superadmin'].includes(j.status) &&
    j.stageDeadline && new Date(j.stageDeadline) < new Date();
  return { ...j, isOverdue: !!overdue, computedTotal: totalOf(j.items) };
}

// ─── Duplicate detection ──────────────────────────────────────────────────────
// (a) cross-member: same date + amount + expenseHead submitted by a DIFFERENT user
// (b) reused bill photo: same bill URL already on another (non-rejected) claim
async function findDuplicates(userId, items, bills) {
  const warnings = [];
  const active = { status: { [Op.notIn]: ['rejected'] } };

  // Pull other users' recent claims once (last 120 days) for cross-member check.
  const others = await Reimbursement.findAll({
    where: { userId: { [Op.ne]: userId }, createdAt: { [Op.gte]: moment().subtract(120, 'days').toDate() }, ...active },
    include: [{ model: User, as: 'employee', attributes: ['firstName', 'lastName'] }],
  });

  for (const it of items || []) {
    for (const o of others) {
      for (const oi of (o.items || [])) {
        const sameDate = String(oi.date || '').slice(0, 10) === String(it.date || '').slice(0, 10);
        const sameAmt = Number(oi.amount) === Number(it.amount);
        const sameHead = (oi.expenseHead || '').trim().toLowerCase() === (it.expenseHead || '').trim().toLowerCase();
        if (sameDate && sameAmt && sameHead && it.date && it.amount) {
          const who = o.employee ? `${o.employee.firstName} ${o.employee.lastName}` : 'another member';
          warnings.push(`Possible duplicate: "${it.expenseHead}" ₹${it.amount} on ${String(it.date).slice(0,10)} also claimed by ${who}.`);
        }
      }
    }
  }

  // Reused bill photo across claims.
  if (bills && bills.length) {
    const withBills = await Reimbursement.findAll({ where: active });
    const used = new Set();
    withBills.forEach(r => (r.bills || []).forEach(b => used.add(b)));
    bills.forEach(b => { if (used.has(b)) warnings.push('A bill photo on this claim was already used on another claim.'); });
  }

  return warnings;
}

// ─── Submit (create) ──────────────────────────────────────────────────────────
exports.submitReimbursement = async (req, res, next) => {
  try {
    // items may arrive as JSON string (multipart) or array (json body)
    let items = req.body.items;
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    items = Array.isArray(items) ? items : [];
    if (items.length === 0) return error(res, 'Add at least one expense line', 400);

    // Upload any bill photos.
    let bills = [];
    if (req.files && req.files.length > 0) {
      bills = await Promise.all(
        req.files.map(f => uploadFile(f.buffer, f.originalname, 'reimbursements/bills', f.mimetype).then(r => r.url))
      );
    }

    const amount = totalOf(items);
    const warnings = await findDuplicates(req.user.id, items, bills);

    const r = await Reimbursement.create({
      userId: req.user.id,
      title: req.body.title || `Reimbursement ${moment().format('MMM YYYY')}`,
      description: req.body.description,
      items, amount, bills,
      currency: req.body.currency || 'INR',
      expenseDate: items[0]?.date || null,
      remarks: req.body.remarks,
      status: 'pending_accounts',
      stageDeadline: slaDeadline(),
    });

    // Notify the Accounts approver.
    const accountsUsers = await User.findAll({ where: { role: 'accounts', isActive: true, isArchived: false } });
    await Promise.all(accountsUsers.map(a =>
      createNotification(a.id, 'New reimbursement to review',
        `${req.user.firstName} submitted ₹${amount}. Due in ${SLA_DAYS} days.`,
        'reimbursement', r.id, 'Reimbursement')));

    return success(res, { id: r.id, total: amount, duplicateWarnings: warnings },
      warnings.length ? 'Submitted with duplicate warnings' : 'Reimbursement submitted', 201);
  } catch (err) {
    next(err);
  }
};

// Member resubmits a sent-back claim (edit items, back to accounts stage).
exports.resubmitReimbursement = async (req, res, next) => {
  try {
    const r = await Reimbursement.findByPk(req.params.id);
    if (!r) return error(res, 'Not found', 404);
    if (r.userId !== req.user.id) return error(res, 'Not your claim', 403);
    if (r.status !== 'sent_back') return error(res, 'Only sent-back claims can be resubmitted', 400);

    let items = req.body.items;
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    if (Array.isArray(items) && items.length) {
      await r.update({ items, amount: totalOf(items), expenseDate: items[0]?.date || r.expenseDate });
    }
    await r.update({ status: 'pending_accounts', stageDeadline: slaDeadline(), sentBackReason: null });

    const accountsUsers = await User.findAll({ where: { role: 'accounts', isActive: true, isArchived: false } });
    await Promise.all(accountsUsers.map(a =>
      createNotification(a.id, 'Reimbursement resubmitted',
        `${req.user.firstName} resubmitted a claim.`, 'reimbursement', r.id, 'Reimbursement')));
    return success(res, decorate(r), 'Resubmitted');
  } catch (err) {
    next(err);
  }
};

// ─── Accounts stage action ────────────────────────────────────────────────────
// action: approve | reject | send_back
exports.accountsAction = async (req, res, next) => {
  try {
    const { action, remark } = req.body;
    const r = await Reimbursement.findByPk(req.params.id);
    if (!r) return error(res, 'Not found', 404);
    if (r.status !== 'pending_accounts') return error(res, 'Claim is not awaiting Accounts', 400);

    if (action === 'approve') {
      await r.update({
        status: 'pending_superadmin', accountsBy: req.user.id, accountsAt: new Date(),
        accountsRemark: remark, stageDeadline: slaDeadline(),
      });
      const supers = await User.findAll({ where: { role: 'super_admin', isActive: true } });
      await Promise.all(supers.map(s =>
        createNotification(s.id, 'Reimbursement needs final approval',
          `Accounts approved ₹${r.amount}. Due in ${SLA_DAYS} days.`, 'reimbursement', r.id, 'Reimbursement')));
      await createNotification(r.userId, 'Reimbursement approved by Accounts',
        `Your ₹${r.amount} claim moved to final approval.`, 'reimbursement', r.id, 'Reimbursement');
    } else if (action === 'reject') {
      await r.update({ status: 'rejected', accountsBy: req.user.id, accountsAt: new Date(), rejectionReason: remark });
      await createNotification(r.userId, 'Reimbursement rejected',
        `Accounts rejected your claim. Reason: ${remark || '—'}`, 'reimbursement', r.id, 'Reimbursement');
    } else if (action === 'send_back') {
      await r.update({ status: 'sent_back', accountsBy: req.user.id, accountsAt: new Date(), sentBackReason: remark });
      await createNotification(r.userId, 'Reimbursement sent back',
        `Accounts needs changes: ${remark || 'see remarks'}`, 'reimbursement', r.id, 'Reimbursement');
    } else {
      return error(res, 'action must be approve | reject | send_back', 400);
    }
    return success(res, decorate(r), `Claim ${action}`);
  } catch (err) {
    next(err);
  }
};

// ─── Super-admin stage action ─────────────────────────────────────────────────
// action: approve | reject | send_back (to accounts)
exports.superAdminAction = async (req, res, next) => {
  try {
    const { action, remark } = req.body;
    const r = await Reimbursement.findByPk(req.params.id);
    if (!r) return error(res, 'Not found', 404);
    if (r.status !== 'pending_superadmin') return error(res, 'Claim is not awaiting Super Admin', 400);

    if (action === 'approve') {
      await r.update({ status: 'approved', approvedBy: req.user.id, approvedAt: new Date(), superAdminRemark: remark, stageDeadline: null });
      await createNotification(r.userId, 'Reimbursement approved 🎉',
        `Your ₹${r.amount} claim is fully approved.`, 'reimbursement', r.id, 'Reimbursement');
    } else if (action === 'reject') {
      await r.update({ status: 'rejected', approvedBy: req.user.id, approvedAt: new Date(), rejectionReason: remark, stageDeadline: null });
      await createNotification(r.userId, 'Reimbursement rejected',
        `Super Admin rejected your claim. Reason: ${remark || '—'}`, 'reimbursement', r.id, 'Reimbursement');
    } else if (action === 'send_back') {
      // Back to Accounts for re-check (discuss).
      await r.update({ status: 'pending_accounts', superAdminRemark: remark, stageDeadline: slaDeadline() });
      const accountsUsers = await User.findAll({ where: { role: 'accounts', isActive: true, isArchived: false } });
      await Promise.all(accountsUsers.map(a =>
        createNotification(a.id, 'Reimbursement returned by Super Admin',
          `Please re-check: ${remark || 'see remarks'}`, 'reimbursement', r.id, 'Reimbursement')));
    } else {
      return error(res, 'action must be approve | reject | send_back', 400);
    }
    return success(res, decorate(r), `Claim ${action}`);
  } catch (err) {
    next(err);
  }
};

// ─── Reads ────────────────────────────────────────────────────────────────────
exports.getMyReimbursements = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const where = { userId: req.user.id };
    if (status) where.status = status;
    const { count, rows } = await Reimbursement.findAndCountAll({
      where, limit: +limit, offset: +offset, order: [['createdAt', 'DESC']],
    });
    return paginated(res, rows.map(decorate), count, page, limit);
  } catch (err) { next(err); }
};

// Accounts sees pending_accounts; super_admin sees everything (default pending_superadmin).
exports.getQueue = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = {};
    if (req.user.role === 'accounts') {
      where.status = req.query.status || 'pending_accounts';
    } else { // super_admin
      where = req.query.status ? { status: req.query.status } : {};
    }
    const { count, rows } = await Reimbursement.findAndCountAll({
      where,
      include: [{ model: User, as: 'employee', attributes: ['id', 'firstName', 'lastName', 'employeeId', 'department'] }],
      limit: +limit, offset: +offset, order: [['stageDeadline', 'ASC'], ['createdAt', 'DESC']],
    });
    return paginated(res, rows.map(decorate), count, page, limit);
  } catch (err) { next(err); }
};

exports.getReimbursement = async (req, res, next) => {
  try {
    const r = await Reimbursement.findByPk(req.params.id, {
      include: [{ model: User, as: 'employee', attributes: ['id', 'firstName', 'lastName', 'employeeId', 'department'] }],
    });
    if (!r) return error(res, 'Not found', 404);
    // Members can only see their own; accounts/super_admin see all.
    if (r.userId !== req.user.id && !['accounts', 'super_admin'].includes(req.user.role)) {
      return error(res, 'Not allowed', 403);
    }
    return success(res, decorate(r));
  } catch (err) { next(err); }
};

exports.markAsPaid = async (req, res, next) => {
  try {
    const r = await Reimbursement.findByPk(req.params.id);
    if (!r) return error(res, 'Not found', 404);
    if (r.status !== 'approved') return error(res, 'Must be approved before marking paid', 400);
    await r.update({ status: 'paid', paidAt: new Date() });
    await createNotification(r.userId, 'Reimbursement paid',
      `₹${r.amount} has been transferred.`, 'reimbursement', r.id, 'Reimbursement');
    return success(res, decorate(r), 'Marked as paid');
  } catch (err) { next(err); }
};
