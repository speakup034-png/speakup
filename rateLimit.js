const rateLimit = require('express-rate-limit');

// Tight limit on OTP sends — this is the #1 abuse vector for phone-based auth.
const otpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: (req) => req.body.phone || req.ip,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many OTP requests. Try again later.' },
  },
});

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
});

module.exports = { otpSendLimiter, generalApiLimiter };
