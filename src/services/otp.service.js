// In-memory OTP store. Was Redis; that was overkill for 6-digit codes with 10-min TTL.
// If you ever run multiple backend replicas, switch to Redis then — until then, one Map.
const logger = require('../utils/logger');

const OTP_EXPIRY_SEC = parseInt(process.env.OTP_EXPIRY_MINUTES || '10') * 60;
const OTP_LENGTH     = parseInt(process.env.OTP_LENGTH || '6');
const TEST_OTP       = '123456';

const store = new Map(); // key -> { value, expiresAt }

function _get(key) {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { store.delete(key); return null; }
  return e.value;
}

function generateOTP() {
  if (process.env.USE_MEMORY_OTP === 'true') return TEST_OTP;
  return String(Math.floor(Math.random() * 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

async function storeOTP(email, otp) {
  store.set(`otp:${email}`, { value: otp, expiresAt: Date.now() + OTP_EXPIRY_SEC * 1000 });
}

async function verifyOTP(email, otp) {
  const stored = _get(`otp:${email}`);
  if (!stored || stored !== otp) return false;
  store.delete(`otp:${email}`);
  return true;
}

// Dev/test helper — read raw OTP without deleting it. Used by /api/auth/test-otp
async function peekOTP(email) {
  return _get(`otp:${email}`);
}

async function sendOTPEmail(email, otp, name = '') {
  if (process.env.SMTP_DISABLED === 'true') {
    logger.info(`\n${'═'.repeat(50)}`);
    logger.info(`📧  OTP FOR: ${email}`);
    logger.info(`🔐  OTP CODE: ${otp}`);
    logger.info(`⏱️  Expires in: ${process.env.OTP_EXPIRY_MINUTES || 10} minutes`);
    logger.info(`${'═'.repeat(50)}\n`);
    return;
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;">
      <div style="background:#1a73e8;padding:24px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;">Company App</h1>
      </div>
      <div style="padding:32px;background:#fff;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;">
        <h2 style="color:#333;">Hi ${name || 'there'}, your OTP is:</h2>
        <div style="background:#1a73e8;color:#fff;font-size:36px;font-weight:bold;letter-spacing:10px;
                    padding:18px;border-radius:8px;text-align:center;margin:20px 0;">${otp}</div>
        <p style="color:#666;">Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. Do not share.</p>
      </div>
    </div>`;

  await transporter.sendMail({
    from: `"${process.env.APP_NAME}" <${process.env.SMTP_FROM}>`,
    to: email, subject: `Your Login OTP — ${otp}`, html,
  });
  logger.info(`OTP sent to ${email}`);
}

module.exports = { generateOTP, storeOTP, verifyOTP, peekOTP, sendOTPEmail };
