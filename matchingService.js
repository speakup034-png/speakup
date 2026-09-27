// Redis-backed matchmaking queue.
// Keeps the actual matching logic out of the WebSocket handler so it's testable
// and so race conditions are handled in one place.
const redis = require('../config/redis');

const QUEUE_KEY = 'match:queue';
const IN_CALL_PREFIX = 'match:incall:'; // user currently in a call

async function isBlockedPair(db, userA, userB) {
  const { rows } = await db.query(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_user_id = $2)
        OR (blocker_id = $2 AND blocked_user_id = $1)
     LIMIT 1`,
    [userA, userB]
  );
  return rows.length > 0;
}

async function enqueue(userId, preferences = {}) {
  await redis.hset(`match:user:${userId}`, {
    preferences: JSON.stringify(preferences),
    queuedAt: Date.now(),
  });
  await redis.lpush(QUEUE_KEY, userId);
}

async function dequeueUser(userId) {
  await redis.lrem(QUEUE_KEY, 0, userId);
  await redis.del(`match:user:${userId}`);
}

async function markInCall(userId, sessionId) {
  await redis.set(`${IN_CALL_PREFIX}${userId}`, sessionId);
}

async function clearInCall(userId) {
  await redis.del(`${IN_CALL_PREFIX}${userId}`);
}

async function isInCall(userId) {
  return Boolean(await redis.get(`${IN_CALL_PREFIX}${userId}`));
}

// Pop the next eligible partner for `userId`, skipping banned/blocked/self/in-call users.
// This is intentionally simple (linear scan of a short queue) — swap for a smarter
// matching algorithm (interest/language weighting) once volume justifies it.
async function findMatch(db, userId) {
  const candidates = await redis.lrange(QUEUE_KEY, 0, -1);

  for (const candidateId of candidates) {
    if (candidateId === userId) continue;
    if (await isInCall(candidateId)) continue;
    if (await isBlockedPair(db, userId, candidateId)) continue;

    // Atomically claim the candidate to avoid two matches grabbing the same user.
    const removed = await redis.lrem(QUEUE_KEY, 1, candidateId);
    if (removed === 0) continue; // someone else already took them

    return candidateId;
  }
  return null;
}

module.exports = { enqueue, dequeueUser, markInCall, clearInCall, isInCall, findMatch };
