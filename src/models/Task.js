const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const isSQLite = process.env.DB_DIALECT === 'sqlite';

const Task = sequelize.define('Task', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  assignedTo: { type: DataTypes.UUID, allowNull: false },
  assignedBy: { type: DataTypes.UUID, allowNull: false },
  priority: { type: DataTypes.STRING, defaultValue: 'medium' },
  status: { type: DataTypes.STRING, defaultValue: 'pending' },
  dueDate: { type: DataTypes.DATE },
  completedAt: { type: DataTypes.DATE },
  // Store arrays as JSON text for SQLite compatibility
  attachments: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('attachments') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('attachments', JSON.stringify(val || [])); },
  },
  comments: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('comments') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('comments', JSON.stringify(val || [])); },
  },
  tags: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('tags') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('tags', JSON.stringify(val || [])); },
  },
  estimatedHours: { type: DataTypes.FLOAT },
  actualHours: { type: DataTypes.FLOAT },
}, {
  timestamps: true,
  indexes: [
    { fields: ['assignedTo'] }, { fields: ['assignedBy'] },
    { fields: ['status'] }, { fields: ['priority'] },
  ],
});

module.exports = Task;
