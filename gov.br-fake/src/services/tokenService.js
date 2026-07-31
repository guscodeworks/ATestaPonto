'use strict';

const { env } = require('../config/env');
const AccessToken = require('../models/AccessToken');
const { generateSecureToken } = require('../utils/crypto');
const fakeUserService = require('./fakeUserService');
const { createAccessTokenStore } = require('../repositories/accessTokenStoreFactory');

const accessTokenStore = createAccessTokenStore();

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

// Emite um access token vinculado a um usuário fake existente, seguindo o padrão
// OAuth2 "Bearer" (usado na troca de authorization code por token).
async function registerAccessToken({
  userSub,
  ttlMs = env.accessTokenTtlMs
}) {
  const user = fakeUserService.findBySub(userSub);

  if (!user) {
    throw new TypeError('Unknown fake user.');
  }

  const accessToken = generateAccessToken();
  const tokenRecord = new AccessToken({
    userSub: user.sub,
    expiresAt: buildExpiresAt(ttlMs)
  });

  await accessTokenStore.saveAccessToken(accessToken, tokenRecord);

  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: Math.floor(Number(ttlMs) / 1000),
    tokenRecord
  };
}

// Resolve as informações públicas do usuário a partir de um access token, usado
// pelo endpoint /userinfo. Tokens ausentes ou expirados são descartados da store
// (housekeeping) e tratados como "sem usuário".
async function findUserInfoByAccessToken(accessToken) {
  const token = getRequiredString(accessToken, 'accessToken');
  const tokenRecord = await accessTokenStore.getAccessToken(token);

  if (!tokenRecord || tokenRecord.isExpired()) {
    if (tokenRecord) {
      await accessTokenStore.deleteAccessToken(token);
    }
    return null;
  }

  const userInfo = fakeUserService.toUserInfo(fakeUserService.findBySub(tokenRecord.userSub));

  if (!userInfo) {
    await accessTokenStore.deleteAccessToken(token);
    return null;
  }

  return userInfo;
}

module.exports = {
  generateAccessToken,
  registerAccessToken,
  findUserInfoByAccessToken
};
