const crypto = require('crypto');
const { User } = require('../models');
const { encryptSecret } = require('./secret');
const logger = require('./logger');

const isProd = process.env.NODE_ENV === 'production';

// SECURITY: this repo is public, so a hardcoded default password would be a
// publicly known super-admin login. In production we REQUIRE the password to
// come from the environment; if it is missing we generate a strong random one
// and print it once to the server log instead of falling back to a known value.
function resolvePassword(envValue, envName) {
  if (envValue) return { password: envValue, generated: false };
  if (!isProd) return { password: 'Creanno@123', generated: false }; // local dev only
  const password = crypto.randomBytes(12).toString('base64url');
  logger.warn(
    `[SECURITY] ${envName} is not set. Generated a one-time random password for ` +
    `this super admin: ${password}  — set ${envName} in the environment and ` +
    `change this password after signing in.`,
  );
  return { password, generated: true };
}

const SUPER_ADMINS = [
  {
    email: (process.env.SUPER_ADMIN_1_EMAIL || 'superadmin1@creanno.com').toLowerCase(),
    envName: 'SUPER_ADMIN_1_PASSWORD',
    envValue: process.env.SUPER_ADMIN_1_PASSWORD,
    firstName: 'Super', lastName: 'Admin One', employeeId: 'SA-001',
  },
  {
    email: (process.env.SUPER_ADMIN_2_EMAIL || 'superadmin2@creanno.com').toLowerCase(),
    envName: 'SUPER_ADMIN_2_PASSWORD',
    envValue: process.env.SUPER_ADMIN_2_PASSWORD,
    firstName: 'Super', lastName: 'Admin Two', employeeId: 'SA-002',
  },
];

async function seedSuperAdmins() {
  for (const sa of SUPER_ADMINS) {
    const existing = await User.findOne({ where: { email: sa.email } });

    // In production, never overwrite an existing super admin's password with a
    // freshly generated one — that would silently lock them out each restart.
    if (existing && isProd && !sa.envValue) {
      await existing.update({ role: 'super_admin', isActive: true, isArchived: false });
      continue;
    }

    const { password } = resolvePassword(sa.envValue, sa.envName);
    const enc = encryptSecret(password);

    if (existing) {
      await existing.update({
        role: 'super_admin', isActive: true, isArchived: false, password: enc,
      });
    } else {
      await User.create({
        email: sa.email, firstName: sa.firstName, lastName: sa.lastName,
        employeeId: sa.employeeId, role: 'super_admin',
        password: enc, isActive: true, isArchived: false,
        department: 'Management', designation: 'Super Admin',
        joiningDate: new Date(),
      });
    }
  }
  logger.info(`Super admins ensured: ${SUPER_ADMINS.map(s => s.email).join(', ')}`);
}

module.exports = { seedSuperAdmins };
