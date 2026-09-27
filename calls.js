const express = require('express');
const router = express.Router();
const controller = require('../controllers/callController');
const { requireAuth } = require('../middleware/auth');

router.get('/usage', requireAuth, controller.getUsage);
router.get('/history', requireAuth, controller.getHistory);
// Call creation/end is driven by the WebSocket layer (server/websocket/), since a call
// is a real-time event, not a plain REST resource — see server/websocket/signaling.js.

module.exports = router;
