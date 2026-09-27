// Socket.IO server: handles auth, matchmaking, and WebRTC signaling relay.
// Actual audio/video never touches this server — only offer/answer/ICE JSON blobs do.
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const matchingService = require('../services/matchingService');
const callController = require('../controllers/callController');

function initWebsocket(io) {
  // Auth handshake: reject the connection outright if the token is invalid,
  // exactly like the REST middleware does.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('UNAUTHENTICATED'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await db.query('SELECT id, status, is_premium FROM users WHERE id = $1', [payload.sub]);
      const user = rows[0];
      if (!user || user.status !== 'active') return next(new Error('UNAUTHENTICATED'));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    socket.join(`user:${userId}`);
    io.emit('user_online', { userId });

    // ---- Matchmaking ----
    socket.on('match_request', async ({ callType, preferences }) => {
      try {
        if (await matchingService.isInCall(userId)) return;
        await callController.assertCanStartCall(userId, socket.user.is_premium);

        const partnerId = await matchingService.findMatch(db, userId);
        if (!partnerId) {
          await matchingService.enqueue(userId, preferences);
          socket.emit('match_waiting');
          return;
        }

        const sessionId = uuidv4();
        await matchingService.markInCall(userId, sessionId);
        await matchingService.markInCall(partnerId, sessionId);

        const payload = { sessionId, callType, startedAt: new Date().toISOString() };
        io.to(`user:${userId}`).emit('match_found', { ...payload, partnerId, isInitiator: true });
        io.to(`user:${partnerId}`).emit('match_found', { ...payload, partnerId: userId, isInitiator: false });
      } catch (err) {
        socket.emit('match_error', { code: err.code || 'MATCH_FAILED', message: err.message });
      }
    });

    socket.on('match_cancel', async () => {
      await matchingService.dequeueUser(userId);
      socket.emit('match_cancelled');
    });

    // ---- WebRTC signaling relay (never inspects or stores the media itself) ----
    socket.on('call_offer', ({ partnerId, offer }) => io.to(`user:${partnerId}`).emit('call_offer', { offer, from: userId }));
    socket.on('call_answer', ({ partnerId, answer }) => io.to(`user:${partnerId}`).emit('call_answer', { answer, from: userId }));
    socket.on('ice_candidate', ({ partnerId, candidate }) => io.to(`user:${partnerId}`).emit('ice_candidate', { candidate, from: userId }));

    socket.on('call_connected', ({ partnerId }) => io.to(`user:${partnerId}`).emit('call_connected'));

    // ---- Ending / skipping a call ----
    async function endCall({ partnerId, sessionId, callType, startedAt, endReason }) {
      await matchingService.clearInCall(userId);
      await matchingService.clearInCall(partnerId);
      await callController.incrementUsage(userId);
      await callController.saveCallSession({
        user1Id: userId,
        user2Id: partnerId,
        callType,
        startedAt,
        endedAt: new Date().toISOString(),
        endReason,
      });
      io.to(`user:${partnerId}`).emit('call_ended', { reason: endReason });
    }

    socket.on('call_ended', async (data) => {
      try { await endCall({ ...data, endReason: 'ended' }); } catch (err) { console.error(err); }
    });

    socket.on('user_skipped', async (data) => {
      try {
        await endCall({ ...data, endReason: 'skipped' });
        // Immediately re-queue the skipper — this is what makes "Next" feel instant.
        socket.emit('match_waiting');
      } catch (err) { console.error(err); }
    });

    socket.on('disconnect', async () => {
      io.emit('user_offline', { userId });
      await matchingService.dequeueUser(userId);
      // Any active call partner should be told the user vanished — in production,
      // look up the active session from Redis and emit user_disconnected to the partner.
    });
  });
}

module.exports = { initWebsocket };
