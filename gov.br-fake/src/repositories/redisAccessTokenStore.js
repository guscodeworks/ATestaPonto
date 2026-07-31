'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');
const {
  buildRedisKeyPrefix,
  getRedisClient
} = require('../config/redis');
const {
  AccessTokenStore,
  getAccessTokenTtlMs,
  normalizeAccessToken,
  serializeAccessToken,
  validateAccessToken
} = require('./accessTokenStore');

const ACCESS_TOKEN_KEY_PREFIX = buildRedisKeyPrefix('gov', 'token');

function buildAccessTokenKey(token) {
  const tokenHash = crypto
    .createHash('sha256')
    .update(validateAccessToken(token))
    .digest('hex');

  return `${ACCESS_TOKEN_KEY_PREFIX}${tokenHash}`;
}

function deserializeAccessToken(value) {
  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  if (value && typeof value === 'object') {
    return value;
  }

  throw new TypeError('Redis returned invalid access token data.');
}

class RedisAccessTokenStore extends AccessTokenStore {
  constructor() {
    super();
    this.client = getRedisClient();
  }

  async saveAccessToken(token, accessToken) {
    const key = buildAccessTokenKey(token);
    const record = normalizeAccessToken(accessToken);
    const ttlMs = getAccessTokenTtlMs(
      record,
      env.accessTokenTtlMs
    );

    await this.client.set(key, JSON.stringify(serializeAccessToken(record)), {
      px: ttlMs
    });
    return record;
  }

  async getAccessToken(token) {
    const key = buildAccessTokenKey(token);
    const value = await this.client.get(key);
    if (value === null) {
      return null;
    }

    const record = normalizeAccessToken(deserializeAccessToken(value));
    if (record.isExpired()) {
      await this.client.del(key);
      return null;
    }

    return record;
  }

  async deleteAccessToken(token) {
    await this.client.del(buildAccessTokenKey(token));
  }
}

module.exports = { RedisAccessTokenStore };
