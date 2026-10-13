'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');
const { buildRedisKeyPrefix, getRedisClient } = require('../config/redis');

const KEY_PREFIX = buildRedisKeyPrefix('gov', 'pending-authorize');

function buildKey(id) {
  if (typeof id !== 'string' || !id) {
    throw new TypeError('Pending authorization ID must be a non-empty string.');
  }
  return `${KEY_PREFIX}${crypto.createHash('sha256').update(id).digest('hex')}`;
}

function deserialize(value) {
  if (value === null) return null;
  const record = typeof value === 'string' ? JSON.parse(value) : value;
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      !Number.isFinite(record.expiresAt)) {
    throw new TypeError('Redis returned invalid pending authorization data.');
  }
  return record.expiresAt > Date.now() ? record : null;
}

async function savePendingAuthorizeRequest(id, request) {
  const ttlMs = env.pendingAuthorizeRequestTtlMs;
  const record = {
    responseType: request.responseType,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    state: request.state,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: request.codeChallengeMethod,
    expiresAt: Date.now() + ttlMs,
  };
  await getRedisClient().set(buildKey(id), JSON.stringify(record), { px: ttlMs });
}

async function getPendingAuthorizeRequest(id) {
  return deserialize(await getRedisClient().get(buildKey(id)));
}

async function consumePendingAuthorizeRequest(id) {
  // GETDEL é atômico entre processos; nunca separar leitura e remoção.
  return deserialize(await getRedisClient().getdel(buildKey(id)));
}

module.exports = {
  savePendingAuthorizeRequest,
  getPendingAuthorizeRequest,
  consumePendingAuthorizeRequest,
};
