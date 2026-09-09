const { User } = require('../models');
const { encryptSecret } = require('./secret');
const logger = require('./logger');

// Two stage-1 super admins. Credentials come from env if set, else test defaults.
// Runs every startup and re-encrypts the configured password with the CURRENT
// server key, so a key/password change self-heals on the next deploy.
const SUPER_ADMINS = [
  {
    email: (process.env.SUPER_ADMIN_1_EMAIL || 'superadmin1@creanno.com').toLowerCase(),
    password: process.env.SUPER_ADMIN_1_PASSWORD || 'Creanno@123',
    firstName: 'Super', lastName: 'Admin One', employeeId: 'SA-001',
  },
  {
    email: (process.env.SUPER_ADMIN_2_EMAIL || 'superadmin2@creanno.com').toLowerCase(),
    password: process.env.SUPER_ADMIN_2_PASSWORD || 'Creanno@123',
    firstName: 'Super', lastName: 'Admin Two', employeeId: 'SA-002',
  },
];

async function seedSuperAdmins() {
  for (const sa of SUPER_ADMINS) {
    const enc = encryptSecret(sa.password);
    const existing = await User.findOne({ where: { email: sa.email } });
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
