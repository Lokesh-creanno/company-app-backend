const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY_MINUTES || '10') * 60;
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || '6');

// In test mode use a fixed OTP so tests are predictable
const TEST_OTP = '123456';

function generateOTP() {
  if (process.env.USE_MEMORY_OTP === 'true') return TEST_OTP;
  let otp = '';
  for (let i = 0; i < OTP_LENGTH; i++) otp += Math.floor(Math.random() * 10);
  return otp;
}

async function storeOTP(email, otp) {
  const redis = await getRedisClient();
  await redis.setEx(`otp:${email}`, OTP_EXPIRY, otp);
}

async function verifyOTP(email, otp) {
  const redis = await getRedisClient();
  const stored = await redis.get(`otp:${email}`);
  if (!stored || stored !== otp) return false;
  await redis.del(`otp:${email}`);
  return true;
}

async function sendOTPEmail(email, otp, name = '') {
  if (process.env.SMTP_DISABLED === 'true') {
    // In test/dev mode: print OTP to console instead of sending email
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

module.exports = { generateOTP, storeOTP, verifyOTP, sendOTPEmail };
