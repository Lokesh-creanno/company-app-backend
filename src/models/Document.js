const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Document = sequelize.define('Document', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.STRING, allowNull: false },
  fileUrl: { type: DataTypes.STRING, allowNull: false },
  fileKey: { type: DataTypes.STRING, allowNull: false },
  mimeType: { type: DataTypes.STRING },
  fileSize: { type: DataTypes.INTEGER },
  uploadedBy: { type: DataTypes.UUID },
  accessLevel: { type: DataTypes.STRING, defaultValue: 'private' },
  expiryDate: { type: DataTypes.DATEONLY },
  isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
  verifiedBy: { type: DataTypes.UUID, allowNull: true },
}, {
  timestamps: true,
  indexes: [{ fields: ['userId'] }, { fields: ['type'] }],
});

module.exports = Document;
