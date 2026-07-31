'use strict';

const AccessToken = require('../models/AccessToken');

class AccessTokenStore {
  async saveAccessToken(_token, _accessToken) {
    throw new Error(
      'AccessTokenStore.saveAccessToken must be implemented.'
    );
  }

  async getAccessToken(_token) {
    throw new Error(
      'AccessTokenStore.getAccessToken must be implemented.'
    );
  }

  async deleteAccessToken(_token) {
    throw new Error(
      'AccessTokenStore.deleteAccessToken must be implemented.'
    );
  }
}

function validateAccessToken(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw new TypeError('Access token must be a non-empty string.');
  }

  return normalizedToken;
}

function normalizeAccessToken(accessToken) {
  if (!accessToken || typeof accessToken !== 'object') {
    throw new TypeError('Access token data must be an object.');
  }

  const normalized = new AccessToken({
    userSub: accessToken.userSub,
    expiresAt: accessToken.expiresAt
  });

  if (!normalized.userSub) {
    throw new TypeError('Access token data is incomplete.');
  }
  if (!Number.isFinite(normalized.expiresAt) || normalized.expiresAt <= 0) {
    throw new TypeError('Access token expiresAt is invalid.');
  }

  return normalized;
}

function getAccessTokenTtlMs(accessToken, maximumTtlMs) {
  const record = normalizeAccessToken(accessToken);
  const maxTtlMs = Number(maximumTtlMs);
  const ttlMs = record.expiresAt - Date.now();

  if (
    !Number.isFinite(maxTtlMs) ||
    maxTtlMs <= 0 ||
    !Number.isFinite(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > maxTtlMs
  ) {
    throw new RangeError('Access token TTL is outside the allowed range.');
  }

  return Math.ceil(ttlMs);
}

function serializeAccessToken(accessToken) {
  const record = normalizeAccessToken(accessToken);

  return {
    userSub: record.userSub,
    expiresAt: record.expiresAt
  };
}

module.exports = {
  AccessTokenStore,
  getAccessTokenTtlMs,
  normalizeAccessToken,
  serializeAccessToken,
  validateAccessToken
};
