const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { otpSendLimiter } = require('../middleware/rateLimit');

router.post('/otp/send', otpSendLimiter, authController.sendOtp);
router.post('/otp/verify', authController.verifyOtp);

module.exports = router;
module.exports.meHandler = [requireAuth, authController.me]; // mounted at GET /api/me in index.js
