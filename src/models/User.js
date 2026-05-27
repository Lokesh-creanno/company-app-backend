const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  employeeId: { type: DataTypes.STRING, unique: true, allowNull: false },
  firstName: { type: DataTypes.STRING, allowNull: false },
  lastName: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, unique: true, allowNull: false, validate: { isEmail: true } },
  phone: { type: DataTypes.STRING },
  role: { type: DataTypes.STRING, defaultValue: 'employee' },
  department: { type: DataTypes.STRING },
  designation: { type: DataTypes.STRING },
  managerId: { type: DataTypes.UUID, allowNull: true },
  profilePhoto: { type: DataTypes.STRING },
  joiningDate: { type: DataTypes.DATEONLY },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  fcmToken: { type: DataTypes.STRING },
  lastLogin: { type: DataTypes.DATE },
  refreshToken: { type: DataTypes.TEXT },
}, {
  timestamps: true,
  indexes: [{ fields: ['email'] }, { fields: ['employeeId'] }, { fields: ['role'] }],
});

module.exports = User;
