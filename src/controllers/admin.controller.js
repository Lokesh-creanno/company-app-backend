const { User } = require('../models');
const { encryptSecret, decryptSecret } = require('../utils/secret');
const { success, error } = require('../utils/response');

// Roles a super admin is allowed to assign. super_admin is intentionally NOT
// creatable through the normal create form — seed those deliberately.
const ASSIGNABLE_ROLES = ['accounts', 'employee', 'admin', 'manager'];

function adminView(u) {
  return {
    id: u.id,
    employeeId: u.employeeId,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    department: u.department,
    designation: u.designation,
    isActive: u.isActive,
    isArchived: u.isArchived,
    lastLogin: u.lastLogin,
    createdAt: u.createdAt,
  };
}

// GET /api/admin/users?includeArchived=true
exports.listUsers = async (req, res, next) => {
  try {
    const where = req.query.includeArchived === 'true' ? {} : { isArchived: false };
    const users = await User.findAll({ where, order: [['createdAt', 'DESC']] });
    return success(res, users.map(adminView));
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/users
exports.createUser = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, role, employeeId,
            phone, department, designation } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return error(res, 'firstName, lastName, email and password are required', 400);
    }
    const roleToSet = role || 'employee';
    if (!ASSIGNABLE_ROLES.includes(roleToSet)) {
      return error(res, `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`, 400);
    }
    const emailLc = String(email).toLowerCase();
    if (await User.findOne({ where: { email: emailLc } })) {
      return error(res, 'A user with this email already exists', 409);
    }
    // Only one ACCOUNTS user allowed (stage 1 rule).
    if (roleToSet === 'accounts') {
      const existing = await User.findOne({ where: { role: 'accounts', isArchived: false } });
      if (existing) return error(res, 'An Accounts user already exists. Archive it first.', 409);
    }
    const empId = employeeId || `EMP-${Date.now().toString(36).toUpperCase()}`;
    if (await User.findOne({ where: { employeeId: empId } })) {
      return error(res, 'This employee ID is already taken', 409);
    }

    const user = await User.create({
      firstName, lastName,
      email: emailLc,
      password: encryptSecret(password),
      role: roleToSet,
      employeeId: empId,
      phone, department, designation,
      isActive: true,
      isArchived: false,
      joiningDate: new Date(),
    });
    return success(res, adminView(user), 'User created', 201);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:id  — edit profile fields and/or reset password
exports.updateUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return error(res, 'User not found', 404);

    const { firstName, lastName, phone, department, designation, role, password } = req.body;
    const patch = {};
    if (firstName !== undefined) patch.firstName = firstName;
    if (lastName !== undefined) patch.lastName = lastName;
    if (phone !== undefined) patch.phone = phone;
    if (department !== undefined) patch.department = department;
    if (designation !== undefined) patch.designation = designation;
    if (role !== undefined) {
      if (!ASSIGNABLE_ROLES.includes(role)) {
        return error(res, `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`, 400);
      }
      patch.role = role;
    }
    if (password) patch.password = encryptSecret(password); // reset password

    await user.update(patch);
    return success(res, adminView(user), 'User updated');
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users/:id/password — super admin views the plaintext password
exports.viewPassword = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return error(res, 'User not found', 404);
    const plain = decryptSecret(user.password);
    if (plain == null) return error(res, 'No password set for this user', 404);
    return success(res, { id: user.id, email: user.email, password: plain });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/users/:id/archive  and  /unarchive
exports.archiveUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return error(res, 'User not found', 404);
    if (user.role === 'super_admin') return error(res, 'Super admins cannot be archived here', 403);
    await user.update({ isArchived: true, isActive: false, refreshToken: null });
    return success(res, adminView(user), 'User archived');
  } catch (err) {
    next(err);
  }
};

exports.unarchiveUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return error(res, 'User not found', 404);
    await user.update({ isArchived: false, isActive: true });
    return success(res, adminView(user), 'User restored');
  } catch (err) {
    next(err);
  }
};
