'use strict';

const { env } = require('../config/env');
const memoryStore = require('./memoryStore');
const {
  FakeSessionStore,
  createSessionRecord,
  normalizeStoredSession,
  validateSessionId
} = require('./fakeSessionStore');

class MemoryFakeSessionStore extends FakeSessionStore {
  async saveSession(sessionId, sessionData) {
    const validatedSessionId = validateSessionId(sessionId);
    const record = createSessionRecord(sessionData, env.fakeSessionTtlMs);

    memoryStore.saveFakeLoginSession(validatedSessionId, record);
    return record;
  }

  async getSession(sessionId) {
    const validatedSessionId = validateSessionId(sessionId);
    const storedSession = memoryStore.getFakeLoginSession(validatedSessionId);

    if (!storedSession) {
      return null;
    }

    const record = normalizeStoredSession(storedSession);
    if (record.expiresAt <= Date.now()) {
      memoryStore.deleteFakeLoginSession(validatedSessionId);
      return null;
    }

    return record;
  }

  async deleteSession(sessionId) {
    memoryStore.deleteFakeLoginSession(validateSessionId(sessionId));
  }
}

module.exports = { MemoryFakeSessionStore };
