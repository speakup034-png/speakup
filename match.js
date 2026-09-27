// Matching itself happens over WebSocket (server/websocket/index.js) since it's
// inherently real-time. This route just exposes usage-limit-aware entry checks
// for clients that want a pre-flight REST check before opening the socket call.
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const callController = require('../controllers/callController');

router.get('/can-start', requireAuth, async (req, res, next) => {
  try {
    await callController.assertCanStartCall(req.user.id, req.user.is_premium);
    res.json({ success: true, data: { canStart: true } });
  } catch (err) {
    if (err.code === 'DAILY_LIMIT_REACHED') {
      return res.json({ success: true, data: { canStart: false, reason: err.code } });
    }
    next(err);
  }
});

module.exports = router;
