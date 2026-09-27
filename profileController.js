const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');

const MIN_AGE = 18;

function calcAge(dob) {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

// POST /api/profile — create/complete profile after first OTP login.
// Age gate is enforced HERE, server-side — never trust a frontend check alone.
async function createProfile(req, res, next) {
  try {
    const { displayName, dateOfBirth, gender, country, language, interests, bio, profilePhoto } = req.body;
    if (!displayName || !dateOfBirth) {
      throw new ApiError(400, 'MISSING_FIELDS', 'Display name and date of birth are required');
    }
    if (calcAge(dateOfBirth) < MIN_AGE) {
      throw new ApiError(403, 'AGE_RESTRICTED', 'You must be 18 or older to use SpeakUp');
    }

    const { rows } = await db.query(
      `INSERT INTO profiles (user_id, display_name, date_of_birth, gender, country, language, interests, bio, profile_photo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name, gender = EXCLUDED.gender, country = EXCLUDED.country,
         language = EXCLUDED.language, interests = EXCLUDED.interests, bio = EXCLUDED.bio,
         profile_photo = EXCLUDED.profile_photo, updated_at = now()
       RETURNING *`,
      [req.user.id, displayName, dateOfBirth, gender, country, language, interests || [], bio, profilePhoto]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// GET /api/profile/:id — public-safe view only. Never returns phone/email/DOB.
async function getPublicProfile(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT display_name, gender, country, language, interests, bio, profile_photo
       FROM profiles WHERE user_id = $1`,
      [req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Profile not found');
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  return createProfile(req, res, next); // upsert covers both paths
}

module.exports = { createProfile, getPublicProfile, updateProfile };
