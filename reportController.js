const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');

const VALID_REASONS = ['harassment', 'nudity', 'spam', 'scam', 'hate', 'underage', 'threatening', 'other'];

// POST /api/reports
async function createReport(req, res, next) {
  try {
    const { reportedUserId, callSessionId, reason, description } = req.body;
    if (!reportedUserId || !reason) throw new ApiError(400, 'MISSING_FIELDS', 'reportedUserId and reason are required');
    if (!VALID_REASONS.includes(reason)) throw new ApiError(400, 'INVALID_REASON', 'Unrecognized report reason');
    if (reportedUserId === req.user.id) throw new ApiError(400, 'INVALID_TARGET', 'You cannot report yourself');

    await db.query(
      `INSERT INTO reports (reporter_id, reported_user_id, call_session_id, reason, description)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.user.id, reportedUserId, callSessionId || null, reason, description || null]
    );

    // Lightweight auto-strike: 3+ pending/under_review reports against the same user
    // auto-suspends pending moderator review, rather than waiting on a human every time.
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM reports WHERE reported_user_id = $1 AND status IN ('pending','under_review')`,
      [reportedUserId]
    );
    if (Number(rows[0].count) >= 3) {
      await db.query(`UPDATE users SET status = 'suspended' WHERE id = $1 AND status = 'active'`, [reportedUserId]);
    }

    res.json({ success: true, message: 'Thank you. Your report has been submitted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createReport };
