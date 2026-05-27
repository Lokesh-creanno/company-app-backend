// Load test env if not already set
if (!process.env.NODE_ENV) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env.test') });
}
const { sequelize } = require('./database');
const { User } = require('../models');

async function seed() {
  try {
    await sequelize.authenticate();
    // Disable FK constraints for SQLite clean rebuild
    if (process.env.DB_DIALECT === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = OFF;');
    }
    await sequelize.sync({ force: true });
    if (process.env.DB_DIALECT === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = ON;');
    }
    console.log('✅ Database ready');

    const [admin] = await User.findOrCreate({
      where: { email: 'admin@company.com' },
      defaults: { employeeId: 'EMP001', firstName: 'Super', lastName: 'Admin', email: 'admin@company.com', phone: '+91-9800000001', role: 'admin', department: 'Management', designation: 'System Administrator', joiningDate: '2020-01-01', isActive: true },
    });

    const [manager] = await User.findOrCreate({
      where: { email: 'manager@company.com' },
      defaults: { employeeId: 'EMP002', firstName: 'Rajesh', lastName: 'Kumar', email: 'manager@company.com', phone: '+91-9800000002', role: 'manager', department: 'Engineering', designation: 'Engineering Manager', managerId: admin.id, joiningDate: '2021-03-15', isActive: true },
    });

    const employees = [
      { employeeId: 'EMP003', firstName: 'Priya', lastName: 'Sharma', email: 'priya.sharma@company.com', designation: 'Software Engineer', department: 'Engineering' },
      { employeeId: 'EMP004', firstName: 'Amit', lastName: 'Verma', email: 'amit.verma@company.com', designation: 'UI/UX Designer', department: 'Design' },
      { employeeId: 'EMP005', firstName: 'Sunita', lastName: 'Patel', email: 'sunita.patel@company.com', designation: 'HR Executive', department: 'Human Resources' },
    ];
    for (const emp of employees) {
      await User.findOrCreate({ where: { email: emp.email }, defaults: { ...emp, role: 'employee', managerId: manager.id, joiningDate: '2022-06-01', isActive: true, phone: '+91-980000' + emp.employeeId.slice(-4) } });
    }

    console.log('\n🎉 Seed complete!');
    console.log('──────────────────────────────────────────');
    console.log('  👑 Admin    → admin@company.com');
    console.log('  👔 Manager  → manager@company.com');
    console.log('  👤 Employee → priya.sharma@company.com');
    console.log('  👤 Employee → amit.verma@company.com');
    console.log('  👤 Employee → sunita.patel@company.com');
    console.log('──────────────────────────────────────────');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}
seed();
