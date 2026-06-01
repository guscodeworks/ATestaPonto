'use strict';

const { env } = require('../config/env');
const AuthCode = require('../models/AuthCode');
const { generateSecureToken } = require('../utils/crypto');
const fakeUserService = require('./fakeUserService');
const memoryStore = require('../repositories/memoryStore');

function getRequiredString(value, name) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    throw new TypeError(`${name} is required.`);
  }

  return normalized;
}

function buildExpiresAt(ttlMs = env.authCodeTtlMs) {
  return Date.now() + Number(ttlMs);
}

function generateAuthorizationCode() {
  return generateSecureToken('fake_code');
}

function registerAuthorizationCode({
  codeChallenge,
  codeChallengeMethod,
  redirectUri,
  clientId,
  userSub,
  ttlMs = env.authCodeTtlMs
}) {
  memoryStore.cleanupExpiredRecords();

  const user = fakeUserService.findBySub(userSub);

  if (!user) {
    throw new TypeError('Unknown fake user.');
  }

  const code = generateAuthorizationCode();
  const authCode = new AuthCode({
    codeChallenge: String(codeChallenge || '').trim(),
    codeChallengeMethod: String(codeChallengeMethod || '').trim(),
    redirectUri: getRequiredString(redirectUri, 'redirectUri'),
    clientId: getRequiredString(clientId, 'clientId'),
    userSub: user.sub,
    expiresAt: buildExpiresAt(ttlMs)
  });

  memoryStore.saveAuthCode(code, authCode);

  return {
    code,
    authCode
  };
}

function consumeAuthorizationCode(code) {
  memoryStore.cleanupExpiredRecords();

  const normalizedCode = getRequiredString(code, 'code');
  const authCode = memoryStore.getAuthCode(normalizedCode);

  memoryStore.deleteAuthCode(normalizedCode);

  if (!authCode || authCode.isExpired()) {
    return null;
  }

  return authCode;
}

module.exports = {
  generateAuthorizationCode,
  registerAuthorizationCode,
  consumeAuthorizationCode
};
