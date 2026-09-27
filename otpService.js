// Mobile-number OTP service. Swap sendSms() for your real provider
// (Twilio Verify, MSG91, Firebase Auth Phone) — the interface stays the same.
const crypto = require('crypto');
const db = require('../config/db');

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

function generateOtp() {
  return String(crypto.randomInt(100000, 999999)); // 6 digits
}

function hashOtp(otp, phone) {
  return crypto.createHash('sha256').update(`${otp}:${phone}:${process.env.JWT_SECRET}`).digest('hex');
}

// Normalize to E.164-ish format. Replace with a real libphonenumber check in production.
function normalizePhone(raw) {
  const trimmed = raw.replace(/[^\d+]/g, '');
  if (!trimmed.startsWith('+')) {
    throw new Error('Phone number must include a country code, e.g. +91XXXXXXXXXX');
  }
  return trimmed;
}

async function sendSms(phone, otp) {
  // TODO: replace with real provider call, e.g.:
  // await smsClient.messages.create({ to: phone, body: `Your SpeakUp code is ${otp}` });
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV ONLY] OTP for ${phone}: ${otp}`);
  }
}

async function requestOtp(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const otp = generateOtp();
  const otpHash = hashOtp(otp, phone);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await db.query(
    `INSERT INTO otp_requests (phone_number, otp_hash, expires_at) VALUES ($1, $2, $3)`,
    [phone, otpHash, expiresAt]
  );

  await sendSms(phone, otp); // never log/return the raw OTP outside dev
  return { phone, expiresInSeconds: OTP_TTL_MS / 1000 };
}

async function verifyOtp(rawPhone, otp) {
  const phone = normalizePhone(rawPhone);
  const { rows } = await db.query(
    `SELECT * FROM otp_requests
     WHERE phone_number = $1 AND consumed = false
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );
  const record = rows[0];
  if (!record) return { valid: false, reason: 'No OTP requested for this number' };
  if (new Date(record.expires_at) < new Date()) return { valid: false, reason: 'OTP expired' };
  if (record.attempts >= MAX_ATTEMPTS) return { valid: false, reason: 'Too many attempts, request a new code' };

  const candidateHash = hashOtp(otp, phone);
  if (candidateHash !== record.otp_hash) {
    await db.query('UPDATE otp_requests SET attempts = attempts + 1 WHERE id = $1', [record.id]);
    return { valid: false, reason: 'Incorrect code' };
  }

  await db.query('UPDATE otp_requests SET consumed = true WHERE id = $1', [record.id]);
  return { valid: true, phone };
}

module.exports = { requestOtp, verifyOtp, normalizePhone };
