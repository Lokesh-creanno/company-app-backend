const multer = require('multer');
const { error } = require('../utils/response');

const ALLOWED_TYPES = {
  documents: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  images: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  // Expense bills: PDF, JPG and PNG only, and small enough to store and open
  // on a phone. Enforced here so the rule holds even if the app is bypassed.
  bills: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
};

const MAX_BILL_MB = 4;

const storage = multer.memoryStorage();

function createUpload(fieldType = 'documents', maxSizeMB = 10) {
  return multer({
    storage,
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ALLOWED_TYPES[fieldType] || ALLOWED_TYPES.documents;
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type. Allowed: ${allowed.join(', ')}`));
      }
    },
  });
}

const uploadSingle = (fieldName = 'file', fieldType = 'documents') =>
  createUpload(fieldType).single(fieldName);

const uploadMultiple = (fieldName = 'files', maxCount = 5, fieldType = 'documents') =>
  createUpload(fieldType, fieldType === 'bills' ? MAX_BILL_MB : 10).array(fieldName, maxCount);

const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return error(res, `File too large. Each file must be under ${MAX_BILL_MB} MB.`, 413);
    return error(res, err.message, 400);
  }
  if (err) return error(res, err.message, 400);
  next();
};

module.exports = { uploadSingle, uploadMultiple, handleUploadError };
