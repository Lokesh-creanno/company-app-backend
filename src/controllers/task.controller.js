const { Task, User } = require('../models');
const { success, error, paginated } = require('../utils/response');
const { createNotification } = require('../services/notification.service');
const { uploadFile } = require('../services/storage.service');
const { Op } = require('sequelize');

exports.createTask = async (req, res, next) => {
  try {
    const { title, description, assignedTo, priority, dueDate, estimatedHours, tags } = req.body;

    const assignee = await User.findByPk(assignedTo);
    if (!assignee) return error(res, 'Assignee not found', 404);

    const task = await Task.create({
      title, description, assignedTo, assignedBy: req.user.id,
      priority, dueDate, estimatedHours, tags: tags || [],
    });

    await createNotification(
      assignedTo,
      'New Task Assigned',
      `You have been assigned: "${title}"`,
      'task', task.id, 'Task'
    );

    return success(res, { id: task.id }, 'Task created successfully', 201);
  } catch (err) {
    next(err);
  }
};

exports.getMyTasks = async (req, res, next) => {
  try {
    const { status, priority, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = { assignedTo: req.user.id };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const { count, rows } = await Task.findAndCountAll({
      where,
      include: [{ model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'profilePhoto'] }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['dueDate', 'ASC'], ['priority', 'DESC']],
    });

    return paginated(res, rows, count, page, limit);
  } catch (err) {
    next(err);
  }
};

exports.getAssignedTasks = async (req, res, next) => {
  try {
    const { status, assignedTo, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = { assignedBy: req.user.id };
    if (status) where.status = status;
    if (assignedTo) where.assignedTo = assignedTo;

    const { count, rows } = await Task.findAndCountAll({
      where,
      include: [{ model: User, as: 'assignee', attributes: ['id', 'firstName', 'lastName', 'profilePhoto'] }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
    });

    return paginated(res, rows, count, page, limit);
  } catch (err) {
    next(err);
  }
};

exports.getTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const task = await Task.findByPk(id, {
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'firstName', 'lastName', 'profilePhoto'] },
        { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'profilePhoto'] },
      ],
    });
    if (!task) return error(res, 'Task not found', 404);
    return success(res, task);
  } catch (err) {
    next(err);
  }
};

exports.updateTaskStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, actualHours } = req.body;

    const task = await Task.findByPk(id);
    if (!task) return error(res, 'Task not found', 404);
    if (task.assignedTo !== req.user.id && !['admin', 'manager'].includes(req.user.role)) {
      return error(res, 'Unauthorized', 403);
    }

    const updates = { status };
    if (status === 'completed') updates.completedAt = new Date();
    if (actualHours) updates.actualHours = actualHours;

    await task.update(updates);

    if (task.assignedBy !== req.user.id) {
      await createNotification(
        task.assignedBy,
        'Task Status Updated',
        `Task "${task.title}" is now ${status}.`,
        'task', task.id, 'Task'
      );
    }

    return success(res, {}, 'Task updated');
  } catch (err) {
    next(err);
  }
};

exports.addComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    const task = await Task.findByPk(id);
    if (!task) return error(res, 'Task not found', 404);

    const comments = task.comments || [];
    comments.push({ userId: req.user.id, name: `${req.user.firstName} ${req.user.lastName}`, message, createdAt: new Date() });
    await task.update({ comments });

    const notifyId = req.user.id === task.assignedTo ? task.assignedBy : task.assignedTo;
    await createNotification(notifyId, 'New Comment', `Comment on task "${task.title}"`, 'task', task.id, 'Task');

    return success(res, { comments }, 'Comment added');
  } catch (err) {
    next(err);
  }
};

exports.deleteTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const task = await Task.findByPk(id);
    if (!task) return error(res, 'Task not found', 404);
    if (task.assignedBy !== req.user.id && req.user.role !== 'admin') return error(res, 'Unauthorized', 403);
    await task.destroy();
    return success(res, {}, 'Task deleted');
  } catch (err) {
    next(err);
  }
};
