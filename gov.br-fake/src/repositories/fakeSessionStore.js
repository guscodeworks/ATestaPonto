'use strict';

function validateSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('Fake session ID must be a non-empty string.');
  }

  return sessionId;
}

function normalizeStoredSession(sessionData) {
  if (!sessionData || typeof sessionData !== 'object') {
    throw new TypeError('Fake session data must be an object.');
  }

  const userSub = String(sessionData.userSub || '').trim();
  const expiresAt = Number(sessionData.expiresAt);

  if (!userSub) {
    throw new TypeError('Fake session userSub is required.');
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    throw new TypeError('Fake session expiresAt must be a positive timestamp.');
  }

  return { userSub, expiresAt };
}

function createSessionRecord(sessionData, ttlMs) {
  const parsedTtlMs = Number(ttlMs);
  if (!Number.isFinite(parsedTtlMs) || parsedTtlMs <= 0) {
    throw new RangeError('Fake session TTL must be positive.');
  }

  return normalizeStoredSession({
    userSub: sessionData && sessionData.userSub,
    expiresAt: Date.now() + parsedTtlMs
  });
}

module.exports = {
  createSessionRecord,
  normalizeStoredSession,
  validateSessionId
};
