'use strict';

const { env } = require('../config/env');
const { pendingAuthorizeRequests } = require('./memoryStore');

function validateId(id) {
  if (typeof id !== 'string' || !id) {
    throw new TypeError('Pending authorization ID must be a non-empty string.');
  }
  return id;
}

async function savePendingAuthorizeRequest(id, request) {
  pendingAuthorizeRequests.set(validateId(id), {
    responseType: request.responseType,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    state: request.state,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: request.codeChallengeMethod,
    expiresAt: Date.now() + env.pendingAuthorizeRequestTtlMs,
  });
}

async function getPendingAuthorizeRequest(id) {
  const record = pendingAuthorizeRequests.get(validateId(id));
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    pendingAuthorizeRequests.delete(id);
    return null;
  }
  return { ...record };
}

async function consumePendingAuthorizeRequest(id) {
  const record = pendingAuthorizeRequests.get(validateId(id));
  // Leitura e remoção sem await garantem consumo único neste processo Node.js.
  pendingAuthorizeRequests.delete(id);
  return record && record.expiresAt > Date.now() ? record : null;
}

module.exports = {
  savePendingAuthorizeRequest,
  getPendingAuthorizeRequest,
  consumePendingAuthorizeRequest,
};
