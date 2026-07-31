'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');
const {
  buildRedisKeyPrefix,
  getRedisClient
} = require('../config/redis');
const {
  AuthCodeStore,
  getAuthorizationCodeTtlMs,
  normalizeAuthCode,
  serializeAuthCode,
  validateAuthorizationCode
} = require('./authCodeStore');

const AUTH_CODE_KEY_PREFIX = buildRedisKeyPrefix('gov', 'code');

function buildAuthorizationCodeKey(code) {
  const codeHash = crypto
    .createHash('sha256')
    .update(validateAuthorizationCode(code))
    .digest('hex');

  return `${AUTH_CODE_KEY_PREFIX}${codeHash}`;
}

function deserializeAuthCode(value) {
  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  if (value && typeof value === 'object') {
    return value;
  }

  throw new TypeError('Redis returned invalid authorization code data.');
}

class RedisAuthCodeStore extends AuthCodeStore {
  constructor() {
    super();
    this.client = getRedisClient();
  }

  async saveAuthorizationCode(code, authCode) {
    const key = buildAuthorizationCodeKey(code);
    const record = normalizeAuthCode(authCode);
    const ttlMs = getAuthorizationCodeTtlMs(
      record,
      env.authCodeTtlMs
    );

    await this.client.set(key, JSON.stringify(serializeAuthCode(record)), {
      px: ttlMs
    });
    return record;
  }

  async consumeAuthorizationCode(code) {
    const value = await this.client.getdel(buildAuthorizationCodeKey(code));
    if (value === null) {
      return null;
    }

    const record = normalizeAuthCode(deserializeAuthCode(value));
    return record.isExpired() ? null : record;
  }
}

module.exports = { RedisAuthCodeStore };
