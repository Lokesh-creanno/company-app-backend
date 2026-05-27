const { User, Attendance, Task, Reimbursement } = require('../models');
const { uploadFile } = require('../services/storage.service');
const { success, error, paginated } = require('../utils/response');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

exports.getAllEmployees = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, department, role, isActive } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (search) {
      const likeOp = process.env.DB_DIALECT === 'sqlite' ? Op.like : Op.iLike;
      where[Op.or] = [
        { firstName: { [likeOp]: `%${search}%` } },
        { lastName: { [likeOp]: `%${search}%` } },
        { email: { [likeOp]: `%${search}%` } },
        { employeeId: { [likeOp]: `%${search}%` } },
      ];
    }
    if (department) where.department = department;
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    // Managers can only see their reportees
    if (req.user.role === 'manager') where.managerId = req.user.id;

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['refreshToken', 'fcmToken'] },
      include: [{ model: User, as: 'manager', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['firstName', 'ASC']],
    });

    return paginated(res, rows, count, page, limit);
  } catch (err) {
    next(err);
  }
};

exports.getEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, {
      attributes: { exclude: ['refreshToken', 'fcmToken'] },
      include: [
        { model: User, as: 'manager', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: User, as: 'reportees', attributes: ['id', 'firstName', 'lastName', 'designation'] },
      ],
    });
    if (!user) return error(res, 'Employee not found', 404);
    return success(res, user);
  } catch (err) {
    next(err);
  }
};

exports.createEmployee = async (req, res, next) => {
  try {
    const {
      firstName, lastName, email, phone, role, department,
      designation, managerId, joiningDate, employeeId,
    } = req.body;

    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) return error(res, 'Email already registered', 409);

    const autoEmpId = employeeId || `EMP${Date.now().toString().slice(-6)}`;

    const employee = await User.create({
      firstName, lastName,
      email: email.toLowerCase(),
      phone, role, department, designation,
      managerId: managerId || null,
      joiningDate,
      employeeId: autoEmpId,
    });

    return success(res, { id: employee.id, employeeId: employee.employeeId }, 'Employee created successfully', 201);
  } catch (err) {
    next(err);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await User.findByPk(id);
    if (!employee) return error(res, 'Employee not found', 404);

    const allowedFields = ['firstName', 'lastName', 'phone', 'department', 'designation', 'managerId', 'joiningDate'];
    if (req.user.role === 'admin') allowedFields.push('role', 'isActive');

    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    await employee.update(updates);
    return success(res, {}, 'Employee updated successfully');
  } catch (err) {
    next(err);
  }
};

exports.uploadProfilePhoto = async (req, res, next) => {
  try {
    if (!req.file) return error(res, 'No file uploaded', 400);
    const { id } = req.params;
    const employee = await User.findByPk(id);
    if (!employee) return error(res, 'Employee not found', 404);

    const { url } = await uploadFile(req.file.buffer, req.file.originalname, 'profiles', req.file.mimetype);
    await employee.update({ profilePhoto: url });
    return success(res, { profilePhoto: url }, 'Profile photo updated');
  } catch (err) {
    next(err);
  }
};

exports.deactivateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await User.findByPk(id);
    if (!employee) return error(res, 'Employee not found', 404);
    await employee.update({ isActive: false, refreshToken: null });
    return success(res, {}, 'Employee deactivated');
  } catch (err) {
    next(err);
  }
};
