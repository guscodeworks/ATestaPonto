'use strict';

const { env } = require('../config/env');
const AccessToken = require('../models/AccessToken');
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

function buildExpiresAt(ttlMs = env.accessTokenTtlMs) {
  return Date.now() + Number(ttlMs);
}

function generateAccessToken() {
  return generateSecureToken('fake_access');
}

function registerAccessToken({
  userSub,
  ttlMs = env.accessTokenTtlMs
}) {
  memoryStore.cleanupExpiredRecords();

  const user = fakeUserService.findBySub(userSub);

  if (!user) {
    throw new TypeError('Unknown fake user.');
  }

  const accessToken = generateAccessToken();
  const tokenRecord = new AccessToken({
    userSub: user.sub,
    expiresAt: buildExpiresAt(ttlMs)
  });

  memoryStore.saveAccessToken(accessToken, tokenRecord);

  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: Math.floor(Number(ttlMs) / 1000),
    tokenRecord
  };
}

function findUserInfoByAccessToken(accessToken) {
  memoryStore.cleanupExpiredRecords();

  const token = getRequiredString(accessToken, 'accessToken');
  const tokenRecord = memoryStore.getAccessToken(token);

  if (!tokenRecord || tokenRecord.isExpired()) {
    memoryStore.deleteAccessToken(token);
    return null;
  }

  return fakeUserService.toUserInfo(fakeUserService.findBySub(tokenRecord.userSub));
}

module.exports = {
  generateAccessToken,
  registerAccessToken,
  findUserInfoByAccessToken
};
