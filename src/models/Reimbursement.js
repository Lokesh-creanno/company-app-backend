const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Reimbursement = sequelize.define('Reimbursement', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  category: { type: DataTypes.STRING, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
  expenseDate: { type: DataTypes.DATEONLY, allowNull: false },
  bills: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('bills') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('bills', JSON.stringify(val || [])); },
  },
  status: { type: DataTypes.STRING, defaultValue: 'pending' },
  reviewedBy: { type: DataTypes.UUID, allowNull: true },
  reviewedAt: { type: DataTypes.DATE },
  approvedBy: { type: DataTypes.UUID, allowNull: true },
  approvedAt: { type: DataTypes.DATE },
  rejectionReason: { type: DataTypes.TEXT },
  paidAt: { type: DataTypes.DATE },
  remarks: { type: DataTypes.TEXT },
}, {
  timestamps: true,
  indexes: [{ fields: ['userId'] }, { fields: ['status'] }],
});

module.exports = Reimbursement;
