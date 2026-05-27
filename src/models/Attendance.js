const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Attendance = sequelize.define('Attendance', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  checkInTime: { type: DataTypes.DATE },
  checkOutTime: { type: DataTypes.DATE },
  checkInLocation: {
    type: DataTypes.TEXT,
    get() { try { return JSON.parse(this.getDataValue('checkInLocation') || 'null'); } catch { return null; } },
    set(val) { this.setDataValue('checkInLocation', val ? JSON.stringify(val) : null); },
  },
  checkOutLocation: {
    type: DataTypes.TEXT,
    get() { try { return JSON.parse(this.getDataValue('checkOutLocation') || 'null'); } catch { return null; } },
    set(val) { this.setDataValue('checkOutLocation', val ? JSON.stringify(val) : null); },
  },
  status: { type: DataTypes.STRING, defaultValue: 'absent' },
  workingHours: { type: DataTypes.FLOAT },
  notes: { type: DataTypes.TEXT },
  isManualEntry: { type: DataTypes.BOOLEAN, defaultValue: false },
  approvedBy: { type: DataTypes.UUID, allowNull: true },
}, {
  timestamps: true,
  indexes: [
    { fields: ['userId', 'date'], unique: true },
    { fields: ['date'] }, { fields: ['status'] },
  ],
});

module.exports = Attendance;
