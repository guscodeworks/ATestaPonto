'use strict';

const AuthCode = require('../models/AuthCode');

class AuthCodeStore {
  async saveAuthorizationCode(_code, _authCode) {
    throw new Error(
      'AuthCodeStore.saveAuthorizationCode must be implemented.'
    );
  }

  async consumeAuthorizationCode(_code) {
    throw new Error(
      'AuthCodeStore.consumeAuthorizationCode must be implemented.'
    );
  }
}

function validateAuthorizationCode(code) {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) {
    throw new TypeError('Authorization code must be a non-empty string.');
  }

  return normalizedCode;
}

function normalizeAuthCode(authCode) {
  if (!authCode || typeof authCode !== 'object') {
    throw new TypeError('Authorization code data must be an object.');
  }

  const normalized = new AuthCode({
    codeChallenge: authCode.codeChallenge,
    codeChallengeMethod: authCode.codeChallengeMethod,
    redirectUri: authCode.redirectUri,
    clientId: authCode.clientId,
    userSub: authCode.userSub,
    expiresAt: authCode.expiresAt
  });

  if (!normalized.redirectUri || !normalized.clientId || !normalized.userSub) {
    throw new TypeError('Authorization code data is incomplete.');
  }
  if (!Number.isFinite(normalized.expiresAt) || normalized.expiresAt <= 0) {
    throw new TypeError('Authorization code expiresAt is invalid.');
  }

  return normalized;
}

function getAuthorizationCodeTtlMs(authCode, maximumTtlMs) {
  const record = normalizeAuthCode(authCode);
  const maxTtlMs = Number(maximumTtlMs);
  const ttlMs = record.expiresAt - Date.now();

  if (
    !Number.isFinite(maxTtlMs) ||
    maxTtlMs <= 0 ||
    !Number.isFinite(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > maxTtlMs
  ) {
    throw new RangeError('Authorization code TTL is outside the allowed range.');
  }

  return Math.ceil(ttlMs);
}

function serializeAuthCode(authCode) {
  const record = normalizeAuthCode(authCode);

  return {
    codeChallenge: record.codeChallenge,
    codeChallengeMethod: record.codeChallengeMethod,
    redirectUri: record.redirectUri,
    clientId: record.clientId,
    userSub: record.userSub,
    expiresAt: record.expiresAt
  };
}

module.exports = {
  AuthCodeStore,
  getAuthorizationCodeTtlMs,
  normalizeAuthCode,
  serializeAuthCode,
  validateAuthorizationCode
};
