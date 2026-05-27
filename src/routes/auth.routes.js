const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { uploadSingle, handleUploadError } = require('../middleware/upload.middleware');
const ctrl = require('../controllers/auth.controller');

router.post('/send-otp', ctrl.sendOTP);
router.post('/verify-otp', ctrl.verifyOTP);
router.post('/refresh-token', ctrl.refreshToken);
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.patch('/fcm-token', authenticate, ctrl.updateFCMToken);

// ── TEST-ONLY endpoint — read OTP from in-memory store ───────────────────────
if (process.env.NODE_ENV === 'test' || process.env.USE_MEMORY_OTP === 'true') {
  router.get('/test-otp', async (req, res) => {
    const { getRedisClient } = require('../config/redis');
    const email = req.query.email;
    if (!email) return res.status(400).json({ success: false, message: 'email required' });
    const redis = await getRedisClient();
    const otp = await redis.get(`otp:${email}`);
    return res.json({ success: true, otp });
  });
}

module.exports = router;
