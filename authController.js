const jwt = require('jsonwebtoken');
const db = require('../config/db');
const otpService = require('../services/otpService');
const { ApiError } = require('../middleware/errorHandler');

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// POST /api/auth/otp/send
async function sendOtp(req, res, next) {
  try {
    const { phone } = req.body;
    if (!phone) throw new ApiError(400, 'PHONE_REQUIRED', 'Phone number is required');
    const result = await otpService.requestOtp(phone);
    res.json({ success: true, data: { phone: result.phone, expiresInSeconds: result.expiresInSeconds } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/otp/verify
// New number -> creates the user record and reports isNewUser so the frontend
// can route into profile creation instead of home.
async function verifyOtp(req, res, next) {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) throw new ApiError(400, 'MISSING_FIELDS', 'Phone and code are required');

    const result = await otpService.verifyOtp(phone, otp);
    if (!result.valid) throw new ApiError(400, 'INVALID_OTP', result.reason);

    let { rows } = await db.query('SELECT * FROM users WHERE phone_number = $1', [result.phone]);
    let user = rows[0];
    let isNewUser = false;

    if (!user) {
      const inserted = await db.query(
        `INSERT INTO users (phone_number, phone_verified_at) VALUES ($1, now()) RETURNING *`,
        [result.phone]
      );
      user = inserted.rows[0];
      isNewUser = true;
    } else if (!user.phone_verified_at) {
      await db.query('UPDATE users SET phone_verified_at = now() WHERE id = $1', [user.id]);
    }

    const token = signToken(user.id);
    res.json({
      success: true,
      data: {
        token,
        isNewUser,
        user: { id: user.id, phone: user.phone_number, isPremium: user.is_premium },
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/me
async function me(req, res) {
  res.json({ success: true, data: { id: req.user.id, phone: req.user.phone_number, isPremium: req.user.is_premium } });
}

module.exports = { sendOtp, verifyOtp, me };
