const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Reimbursement = sequelize.define('Reimbursement', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  category: { type: DataTypes.STRING, allowNull: true },      // legacy single-line; items[] is authoritative
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false }, // grand total (sum of items)
  currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
  expenseDate: { type: DataTypes.DATEONLY, allowNull: true },  // claim period / first item date
  bills: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('bills') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('bills', JSON.stringify(val || [])); },
  },
  // Line items: [{ date, category, expenseHead, remarks, amount, billUrl? }]
  items: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('items') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('items', JSON.stringify(val || [])); },
  },
  // Workflow: draft → pending_accounts → pending_superadmin → approved (→ paid)
  //           any stage → rejected | sent_back (back to member to fix + resubmit)
  status: { type: DataTypes.STRING, defaultValue: 'pending_accounts' },
  stageDeadline: { type: DataTypes.DATE },       // when the current stage becomes overdue (5-day SLA)

  // Accounts stage
  accountsBy: { type: DataTypes.UUID, allowNull: true },
  accountsAt: { type: DataTypes.DATE },
  accountsRemark: { type: DataTypes.TEXT },

  // Super-admin stage (final) — reuses approvedBy/approvedAt
  approvedBy: { type: DataTypes.UUID, allowNull: true },
  approvedAt: { type: DataTypes.DATE },
  superAdminRemark: { type: DataTypes.TEXT },

  // Legacy/shared
  reviewedBy: { type: DataTypes.UUID, allowNull: true },
  reviewedAt: { type: DataTypes.DATE },
  rejectionReason: { type: DataTypes.TEXT },
  sentBackReason: { type: DataTypes.TEXT },
  paidAt: { type: DataTypes.DATE },
  remarks: { type: DataTypes.TEXT },
}, {
  timestamps: true,
  indexes: [{ fields: ['userId'] }, { fields: ['status'] }],
});

module.exports = Reimbursement;
