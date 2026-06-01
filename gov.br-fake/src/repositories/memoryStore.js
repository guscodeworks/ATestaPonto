'use strict';

const authCodes = new Map();
const accessTokens = new Map();
const pendingAuthorizeRequests = new Map();

function isRecordExpired(record, now = Date.now()) {
  if (!record) {
    return true;
  }

  if (typeof record.isExpired === 'function') {
    return record.isExpired(now);
  }

  return Number(record.expiresAt) <= now;
}

function deleteExpiredFromMap(map, now) {
  for (const [key, record] of map.entries()) {
    if (isRecordExpired(record, now)) {
      map.delete(key);
    }
  }
}

function cleanupExpiredRecords() {
  const now = Date.now();

  deleteExpiredFromMap(authCodes, now);
  deleteExpiredFromMap(accessTokens, now);
  deleteExpiredFromMap(pendingAuthorizeRequests, now);
}

function startCleanup(intervalMs) {
  const timer = setInterval(cleanupExpiredRecords, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return timer;
}

function saveAuthCode(code, authCode) {
  authCodes.set(code, authCode);
  return authCode;
}

function getAuthCode(code) {
  return authCodes.get(code) || null;
}

function deleteAuthCode(code) {
  authCodes.delete(code);
}

function saveAccessToken(token, accessToken) {
  accessTokens.set(token, accessToken);
  return accessToken;
}

function getAccessToken(token) {
  return accessTokens.get(token) || null;
}

function deleteAccessToken(token) {
  accessTokens.delete(token);
}

function savePendingAuthorizeRequest(id, request) {
  pendingAuthorizeRequests.set(id, request);
  return request;
}

function getPendingAuthorizeRequest(id) {
  return pendingAuthorizeRequests.get(id) || null;
}

function deletePendingAuthorizeRequest(id) {
  pendingAuthorizeRequests.delete(id);
}

module.exports = {
  authCodes,
  accessTokens,
  pendingAuthorizeRequests,
  cleanupExpiredRecords,
  startCleanup,
  saveAuthCode,
  getAuthCode,
  deleteAuthCode,
  saveAccessToken,
  getAccessToken,
  deleteAccessToken,
  savePendingAuthorizeRequest,
  getPendingAuthorizeRequest,
  deletePendingAuthorizeRequest
};
