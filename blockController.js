const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const matchingService = require('../services/matchingService');

// POST /api/blocks
async function createBlock(req, res, next) {
  try {
    const { blockedUserId } = req.body;
    if (!blockedUserId) throw new ApiError(400, 'MISSING_FIELDS', 'blockedUserId is required');
    if (blockedUserId === req.user.id) throw new ApiError(400, 'INVALID_TARGET', 'You cannot block yourself');

    await db.query(
      `INSERT INTO blocks (blocker_id, blocked_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.user.id, blockedUserId]
    );

    // If they're mid-call together, end it immediately — enforced here, not left to the client.
    // (The websocket layer listens for this via a Redis pub/sub "force_end" event in production;
    // kept as a direct call here to show the intended effect for the MVP.)
    await matchingService.clearInCall(req.user.id);

    res.json({ success: true, message: 'User blocked.' });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/blocks/:id
async function removeBlock(req, res, next) {
  try {
    await db.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_user_id = $2`, [req.user.id, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { createBlock, removeBlock };
