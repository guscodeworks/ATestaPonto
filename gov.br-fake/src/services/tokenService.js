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

// Emite um access token vinculado a um usuário fake existente, seguindo o padrão
// OAuth2 "Bearer" (usado na troca de authorization code por token).
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

// Resolve as informações públicas do usuário a partir de um access token, usado
// pelo endpoint /userinfo. Tokens ausentes ou expirados são descartados da store
// (housekeeping) e tratados como "sem usuário".
function findUserInfoByAccessToken(accessToken) {
  memoryStore.cleanupExpiredRecords();

  const token = getRequiredString(accessToken, 'accessToken');
  const tokenRecord = memoryStore.getAccessToken(token);

  // Atenção: `memoryStore.getAccessToken` retorna "{}" (não `undefined`) quando o
  // token não existe, então `!tokenRecord` nunca é verdadeiro aqui. O fluxo cai em
  // `tokenRecord.isExpired()`, mas "{}" não possui esse método — mesmo bug já
  // identificado em `authCodeService.consumeAuthorizationCode`. Ver Sugestões de melhoria.
  if (!tokenRecord || tokenRecord.isExpired()) {
    memoryStore.deleteAccessToken(token);
    return {};
  }

  return fakeUserService.toUserInfo(fakeUserService.findBySub(tokenRecord.userSub));
}

module.exports = {
  generateAccessToken,
  registerAccessToken,
  findUserInfoByAccessToken
};