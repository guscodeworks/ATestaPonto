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

// Cria e persiste um authorization code vinculado a um usuário fake existente,
// seguindo o fluxo Authorization Code (com suporte opcional a PKCE via codeChallenge).
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

// Consome (lê e invalida) um authorization code, garantindo que ele só possa ser
// trocado por um token uma única vez — o delete ocorre sempre, mesmo se o code já
// estiver expirado, para não deixar registros expirados "reaproveitáveis" na store.
function consumeAuthorizationCode(code) {
  memoryStore.cleanupExpiredRecords();

  const normalizedCode = getRequiredString(code, 'code');
  const authCode = memoryStore.getAuthCode(normalizedCode);

  memoryStore.deleteAuthCode(normalizedCode);

  // Atenção: `memoryStore.getAuthCode` retorna "{}" (não `undefined`) quando o code
  // não existe, então `!authCode` nunca é verdadeiro aqui. Nesse caso o fluxo cai em
  // `authCode.isExpired()`, mas "{}" não possui esse método — ver Sugestões de melhoria.
  if (!authCode || authCode.isExpired()) {
    return {};
  }

  return authCode;
}

module.exports = {
  generateAuthorizationCode,
  registerAuthorizationCode,
  consumeAuthorizationCode
};