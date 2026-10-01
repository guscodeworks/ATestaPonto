'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');
const { buildRedisKeyPrefix, getRedisClient } = require('../config/redis');

const KEY_PREFIX = buildRedisKeyPrefix('gov', 'pending-authorize');
const localPendingAuthorizations = new Map();

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
  if (env.redisEnabled) {
    await getRedisClient().set(buildKey(id), JSON.stringify(record), { px: ttlMs });
    return;
  }

  for (const [key, pending] of localPendingAuthorizations) {
    if (pending.expiresAt <= Date.now()) localPendingAuthorizations.delete(key);
  }
  localPendingAuthorizations.set(buildKey(id), record);
}

async function getPendingAuthorizeRequest(id) {
  const key = buildKey(id);
  if (env.redisEnabled) {
    return deserialize(await getRedisClient().get(key));
  }

  const record = localPendingAuthorizations.get(key);
  if (record && record.expiresAt <= Date.now()) {
    localPendingAuthorizations.delete(key);
    return null;
  }
  return deserialize(record || null);
}

async function consumePendingAuthorizeRequest(id) {
  const key = buildKey(id);
  if (!env.redisEnabled) {
    const record = localPendingAuthorizations.get(key);
    localPendingAuthorizations.delete(key);
    return deserialize(record || null);
  }

  // GETDEL é atômico entre processos; nunca separar leitura e remoção.
  return deserialize(await getRedisClient().getdel(key));
}

module.exports = {
  savePendingAuthorizeRequest,
  getPendingAuthorizeRequest,
  consumePendingAuthorizeRequest,
};
