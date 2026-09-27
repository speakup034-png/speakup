const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');

const FREE_DAILY_CALL_LIMIT = 7;

// GET /api/usage — used by the frontend to show "N calls remaining today".
// The number shown is always re-derived here; the frontend never decides this itself.
async function getUsage(req, res, next) {
  try {
    if (req.user.is_premium) {
      return res.json({ success: true, data: { unlimited: true } });
    }
    const { rows } = await db.query(
      `SELECT calls_used FROM usage_limits WHERE user_id = $1 AND usage_date = CURRENT_DATE`,
      [req.user.id]
    );
    const used = rows[0]?.calls_used || 0;
    res.json({
      success: true,
      data: { unlimited: false, used, limit: FREE_DAILY_CALL_LIMIT, remaining: Math.max(0, FREE_DAILY_CALL_LIMIT - used) },
    });
  } catch (err) {
    next(err);
  }
}

// Called internally (by the websocket matching flow) right before starting a call.
// Throws if the free user is out of daily calls. Premium bypasses the check entirely,
// and premium status here comes from req.user (DB-sourced), never the client.
async function assertCanStartCall(userId, isPremium) {
  if (isPremium) return;
  const { rows } = await db.query(
    `INSERT INTO usage_limits (user_id, usage_date, calls_used)
     VALUES ($1, CURRENT_DATE, 0)
     ON CONFLICT (user_id, usage_date) DO NOTHING`,
    [userId]
  );
  const result = await db.query(
    `SELECT calls_used FROM usage_limits WHERE user_id = $1 AND usage_date = CURRENT_DATE`,
    [userId]
  );
  const used = result.rows[0]?.calls_used || 0;
  if (used >= FREE_DAILY_CALL_LIMIT) {
    throw new ApiError(403, 'DAILY_LIMIT_REACHED', 'You have used all your free calls today. Go Premium for unlimited calls.');
  }
}

async function incrementUsage(userId) {
  await db.query(
    `INSERT INTO usage_limits (user_id, usage_date, calls_used)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (user_id, usage_date) DO UPDATE SET calls_used = usage_limits.calls_used + 1`,
    [userId]
  );
}

// Persist a completed/ended call session. Called from the websocket layer on call_ended/skip.
async function saveCallSession({ user1Id, user2Id, callType, startedAt, endedAt, endReason }) {
  const durationSeconds = Math.round((new Date(endedAt) - new Date(startedAt)) / 1000);
  await db.query(
    `INSERT INTO call_sessions (user1_id, user2_id, call_type, started_at, ended_at, duration, end_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [user1Id, user2Id, callType, startedAt, endedAt, durationSeconds, endReason]
  );
}

// GET /api/history — a user's own past calls (never another user's).
async function getHistory(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT id, call_type, started_at, ended_at, duration, end_reason,
              CASE WHEN user1_id = $1 THEN user2_id ELSE user1_id END AS other_user_id
       FROM call_sessions
       WHERE user1_id = $1 OR user2_id = $1
       ORDER BY started_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUsage, assertCanStartCall, incrementUsage, saveCallSession, getHistory, FREE_DAILY_CALL_LIMIT };
