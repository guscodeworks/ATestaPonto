'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');
const {
  buildRedisKeyPrefix,
  getRedisClient
} = require('../config/redis');
const {
  FakeSessionStore,
  createSessionRecord,
  normalizeStoredSession,
  validateSessionId
} = require('./fakeSessionStore');

const SESSION_KEY_PREFIX = buildRedisKeyPrefix('gov', 'session');

function buildSessionKey(sessionId) {
  const sessionIdHash = crypto
    .createHash('sha256')
    .update(validateSessionId(sessionId))
    .digest('hex');

  return `${SESSION_KEY_PREFIX}${sessionIdHash}`;
}

function deserializeSession(value) {
  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  if (value && typeof value === 'object') {
    return value;
  }

  throw new TypeError('Redis returned invalid fake session data.');
}

class RedisFakeSessionStore extends FakeSessionStore {
  constructor() {
    super();
    this.client = getRedisClient();
  }

  async saveSession(sessionId, sessionData) {
    const key = buildSessionKey(sessionId);
    const record = createSessionRecord(sessionData, env.fakeSessionTtlMs);

    await this.client.set(key, JSON.stringify(record), {
      px: env.fakeSessionTtlMs
    });
    return record;
  }

  async getSession(sessionId) {
    const value = await this.client.get(buildSessionKey(sessionId));
    if (value === null) {
      return null;
    }

    const record = normalizeStoredSession(deserializeSession(value));
    return record.expiresAt > Date.now() ? record : null;
  }

  async deleteSession(sessionId) {
    await this.client.del(buildSessionKey(sessionId));
  }
}

module.exports = { RedisFakeSessionStore };
