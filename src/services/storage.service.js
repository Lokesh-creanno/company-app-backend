const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ── Local Storage (test/dev mode) ──────────────────────────────────────────
const LOCAL_DIR = process.env.LOCAL_UPLOAD_DIR || path.join(__dirname, '../../uploads');

async function uploadFileLocal(buffer, originalName, folder = 'documents') {
  const ext = path.extname(originalName);
  const filename = `${uuidv4()}${ext}`;
  const dir = path.join(LOCAL_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  const key = `${folder}/${filename}`;
  return { key, url: `/uploads/${key}` };
}

async function deleteFileLocal(key) {
  const filePath = path.join(LOCAL_DIR, key);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

async function getSignedDownloadUrlLocal(key) {
  return `/uploads/${key}`;
}

// ── AWS S3 (production) ────────────────────────────────────────────────────
async function uploadFileS3(buffer, originalName, folder, mimeType) {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
  const ext = path.extname(originalName);
  const key = `${folder}/${uuidv4()}${ext}`;
  await s3.send(new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key, Body: buffer, ContentType: mimeType, ServerSideEncryption: 'AES256' }));
  return { key, url: `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}` };
}

// ── Unified API ────────────────────────────────────────────────────────────
const useLocal = () => process.env.STORAGE_LOCAL === 'true';

async function uploadFile(buffer, originalName, folder = 'documents', mimeType = 'application/octet-stream') {
  return useLocal() ? uploadFileLocal(buffer, originalName, folder) : uploadFileS3(buffer, originalName, folder, mimeType);
}

async function deleteFile(key) {
  return useLocal() ? deleteFileLocal(key) : (await require('@aws-sdk/client-s3').S3Client).send();
}

async function getSignedDownloadUrl(key) {
  return useLocal() ? getSignedDownloadUrlLocal(key) : (() => { throw new Error('S3 not configured'); })();
}

module.exports = { uploadFile, deleteFile, getSignedDownloadUrl };
