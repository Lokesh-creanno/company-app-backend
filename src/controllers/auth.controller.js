const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User } = require('../models');
const { generateOTP, storeOTP, verifyOTP, sendOTPEmail } = require('../services/otp.service');
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

// ─── Demo Login (for public web demo) ─────────────────────────────────────────
// Creates a persistent demo admin user if not present, then returns a real token.
// Used by the public GitHub Pages web demo so reviewers can test the app
// end-to-end without going through email + OTP.
exports.demoLogin = async (req, res, next) => {
  try {
    const DEMO_EMAIL = 'demo@creanno.com';

    let user = await User.findOne({ where: { email: DEMO_EMAIL } });

    if (!user) {
      logger.info(`Creating demo admin user: ${DEMO_EMAIL}`);
      user = await User.create({
        employeeId:  'EMP-DEMO',
        firstName:   'Demo',
        lastName:    'Admin',
        email:       DEMO_EMAIL,
        phone:       '+91 00000 00000',
        role:        'admin',
        department:  'Operations',
        designation: 'Owner',
        isActive:    true,
        joiningDate: new Date(),
      });
    }

    // Always ensure demo user stays admin and active (in case it was changed)
    if (!user.isActive || user.role !== 'admin') {
      await user.update({ isActive: true, role: 'admin' });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    await user.update({ lastLogin: new Date(), refreshToken });

    return success(res, {
      accessToken,
      refreshToken,
      user: {
        id:           user.id,
        employeeId:   user.employeeId,
        firstName:    user.firstName,
        lastName:     user.lastName,
        email:        user.email,
        role:         user.role,
        department:   user.department,
        designation:  user.designation,
        profilePhoto: user.profilePhoto,
      },
    }, 'Demo login successful');
  } catch (err) {
    next(err);
  }
};

exports.sendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return error(res, 'Email is required', 400);

    const user = await User.findOne({ where: { email: email.toLowerCase(), isActive: true } });
    if (!user) return error(res, 'No active account found with this email', 404);

    const otp = generateOTP();
    await storeOTP(email.toLowerCase(), otp);
    await sendOTPEmail(email, otp, user.firstName);

    return success(res, {}, 'OTP sent to your email');
  } catch (err) {
    next(err);
  }
};

exports.verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return error(res, 'Email and OTP are required', 400);

    const isValid = await verifyOTP(email.toLowerCase(), otp);
    if (!isValid) return error(res, 'Invalid or expired OTP', 401);

    const user = await User.findOne({ where: { email: email.toLowerCase(), isActive: true } });
    if (!user) return error(res, 'User not found', 404);

    const { accessToken, refreshToken } = generateTokens(user);

    await user.update({ lastLogin: new Date(), refreshToken });

    return success(res, {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        employeeId: user.employeeId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        department: user.department,
        designation: user.designation,
        profilePhoto: user.profilePhoto,
      },
    }, 'Login successful');
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
