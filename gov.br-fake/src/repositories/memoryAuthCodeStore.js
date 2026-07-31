'use strict';

const memoryStore = require('./memoryStore');
const {
  AuthCodeStore,
  normalizeAuthCode,
  validateAuthorizationCode
} = require('./authCodeStore');

class MemoryAuthCodeStore extends AuthCodeStore {
  async saveAuthorizationCode(code, authCode) {
    const normalizedCode = validateAuthorizationCode(code);
    const record = normalizeAuthCode(authCode);

    memoryStore.saveAuthCode(normalizedCode, record);
    return record;
  }

  async consumeAuthorizationCode(code) {
    const normalizedCode = validateAuthorizationCode(code);
    const storedAuthCode = memoryStore.getAuthCode(normalizedCode);

    // As duas operações são síncronas e executadas sem yield, garantindo consumo
    // único dentro de um processo Node.js antes que outra Promise possa intercalar.
    memoryStore.deleteAuthCode(normalizedCode);

    if (!storedAuthCode) {
      return null;
    }

    const record = normalizeAuthCode(storedAuthCode);
    return record.isExpired() ? null : record;
  }
}

module.exports = { MemoryAuthCodeStore };
