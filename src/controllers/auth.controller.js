const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User } = require('../models');
const { verifySecret } = require('../utils/secret');
const { success, error } = require('../utils/response');
const logger = require('../utils/logger');

function generateTokens(user) {
  const payload = { id: user.id, role: user.role, email: user.email };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });
  return { accessToken, refreshToken };
}

// Shared shape returned to the client — never includes the password blob.
function publicUser(user) {
  return {
    id: user.id,
    employeeId: user.employeeId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    department: user.department,
    designation: user.designation,
    profilePhoto: user.profilePhoto,
  };
}

// ─── Password login (email OR employeeId + password) ─────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, employeeId, password } = req.body;
    if (!password || (!email && !employeeId)) {
      return error(res, 'Email/ID and password are required', 400);
    }
    const where = email ? { email: String(email).toLowerCase() } : { employeeId };
    const user = await User.findOne({ where });
    // Same generic message whether user missing or password wrong (no enumeration).
    if (!user || !user.password || !verifySecret(password, user.password)) {
      return error(res, 'Invalid email/ID or password', 401);
    }
    if (user.isArchived || !user.isActive) {
      return error(res, 'This account is archived. Contact a super admin.', 403);
    }
    const { accessToken, refreshToken } = generateTokens(user);
    await user.update({ lastLogin: new Date(), refreshToken });
    return success(res, { accessToken, refreshToken, user: publicUser(user) }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return error(res, 'Refresh token required', 400);

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user || user.refreshToken !== refreshToken) return error(res, 'Invalid refresh token', 401);

    const tokens = generateTokens(user);
    await user.update({ refreshToken: tokens.refreshToken });

    return success(res, tokens, 'Tokens refreshed');
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return error(res, 'Invalid or expired token', 401);
    }
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    await req.user.update({ refreshToken: null });
    return success(res, {}, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

exports.updateFCMToken = async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    await req.user.update({ fcmToken });
    return success(res, {}, 'FCM token updated');
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res) => {
  const user = req.user;
  return success(res, {
    id: user.id,
    employeeId: user.employeeId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    department: user.department,
    designation: user.designation,
    profilePhoto: user.profilePhoto,
    joiningDate: user.joiningDate,
    lastLogin: user.lastLogin,
  });
};
