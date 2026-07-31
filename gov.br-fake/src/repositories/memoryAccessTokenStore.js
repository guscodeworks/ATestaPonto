'use strict';

const memoryStore = require('./memoryStore');
const {
  AccessTokenStore,
  normalizeAccessToken,
  validateAccessToken
} = require('./accessTokenStore');

class MemoryAccessTokenStore extends AccessTokenStore {
  async saveAccessToken(token, accessToken) {
    const normalizedToken = validateAccessToken(token);
    const record = normalizeAccessToken(accessToken);

    memoryStore.saveAccessToken(normalizedToken, record);
    return record;
  }

  async getAccessToken(token) {
    const normalizedToken = validateAccessToken(token);
    const storedAccessToken = memoryStore.getAccessToken(normalizedToken);

    if (!storedAccessToken) {
      return null;
    }

    const record = normalizeAccessToken(storedAccessToken);
    if (record.isExpired()) {
      memoryStore.deleteAccessToken(normalizedToken);
      return null;
    }

    return record;
  }

  async deleteAccessToken(token) {
    const normalizedToken = validateAccessToken(token);
    memoryStore.deleteAccessToken(normalizedToken);
  }
}

module.exports = { MemoryAccessTokenStore };
