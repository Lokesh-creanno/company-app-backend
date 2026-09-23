const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/auth.controller');

// Strict brute-force guard on password login. Applied in ALL environments —
// the global /api limiter (100/15min) is far too loose for password guessing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});

router.post('/login', loginLimiter, ctrl.login);
router.post('/refresh-token', ctrl.refreshToken);
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.patch('/fcm-token', authenticate, ctrl.updateFCMToken);

// REMOVED (security):
//  - POST /demo-login   : handed out an ADMIN token with no authentication.
//  - POST /send-otp, /verify-otp : OTP login retired in favour of passwords.
//  - GET  /test-otp     : leaked OTP codes whenever USE_MEMORY_OTP=true
//                         (which is set in production).

module.exports = router;
