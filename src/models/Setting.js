const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Simple key/value store for app-wide settings (office geofence, etc.).
const Setting = sequelize.define('Setting', {
  key: { type: DataTypes.STRING, primaryKey: true },
  value: {
    type: DataTypes.TEXT,
    get() { try { return JSON.parse(this.getDataValue('value') || 'null'); } catch { return null; } },
    set(v) { this.setDataValue('value', JSON.stringify(v ?? null)); },
  },
}, { timestamps: true });

module.exports = Setting;
