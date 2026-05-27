const { Document, User } = require('../models');
const { uploadFile, deleteFile, getSignedDownloadUrl } = require('../services/storage.service');
const { success, error, paginated } = require('../utils/response');

exports.uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) return error(res, 'No file provided', 400);
    const { name, type, accessLevel, expiryDate } = req.body;
    const targetUserId = req.body.userId || req.user.id;

    const { key, url } = await uploadFile(req.file.buffer, req.file.originalname, `documents/${targetUserId}`, req.file.mimetype);

    const doc = await Document.create({
      userId: targetUserId, name, type,
      fileUrl: url, fileKey: key,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.user.id,
      accessLevel: accessLevel || 'private',
      expiryDate: expiryDate || null,
    });

    return success(res, { id: doc.id, url }, 'Document uploaded', 201);
  } catch (err) {
    next(err);
  }
};

exports.getMyDocuments = async (req, res, next) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const where = { userId: req.user.id };
    if (type) where.type = type;

    const { count, rows } = await Document.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
    });

    return paginated(res, rows, count, page, limit);
  } catch (err) {
    next(err);
  }
};

exports.getEmployeeDocuments = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const docs = await Document.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });
    return success(res, docs);
  } catch (err) {
    next(err);
  }
};

exports.getDocumentDownloadUrl = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await Document.findByPk(id);
    if (!doc) return error(res, 'Document not found', 404);

    if (doc.userId !== req.user.id) {
      if (doc.accessLevel === 'private') return error(res, 'Access denied', 403);
      if (doc.accessLevel === 'manager' && !['manager', 'admin'].includes(req.user.role)) return error(res, 'Access denied', 403);
      if (doc.accessLevel === 'admin' && req.user.role !== 'admin') return error(res, 'Access denied', 403);
    }

    const url = await getSignedDownloadUrl(doc.fileKey, 900); // 15 min expiry
    return success(res, { url, expiresIn: 900 });
  } catch (err) {
    next(err);
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await Document.findByPk(id);
    if (!doc) return error(res, 'Document not found', 404);
    if (doc.userId !== req.user.id && req.user.role !== 'admin') return error(res, 'Unauthorized', 403);

    await deleteFile(doc.fileKey);
    await doc.destroy();
    return success(res, {}, 'Document deleted');
  } catch (err) {
    next(err);
  }
};

exports.verifyDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await Document.findByPk(id);
    if (!doc) return error(res, 'Document not found', 404);
    await doc.update({ isVerified: true, verifiedBy: req.user.id });
    return success(res, {}, 'Document verified');
  } catch (err) {
    next(err);
  }
};
