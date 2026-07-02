'use strict';

// Repositório em memória (não persistente) para os dados voláteis do fluxo OAuth2 fake:
// tudo é perdido ao reiniciar o processo, o que é aceitável pois trata-se de um
// ambiente de demonstração, não de produção.
const authCodes = new Map();
const accessTokens = new Map();
const pendingAuthorizeRequests = new Map();
const fakeLoginSessions = new Map();

// Suporta tanto registros com método `isExpired` (ex.: instâncias de AccessToken/AuthCode)
// quanto objetos simples com `expiresAt`, permitindo reaproveitar a mesma limpeza
// para os diferentes tipos de registro armazenados nos Maps deste módulo.
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

// Remove registros expirados de todas as stores, evitando vazamento de memória
// (accessTokens, authCodes, etc. nunca seriam limpos de outra forma).
function cleanupExpiredRecords() {
  const now = Date.now();

  deleteExpiredFromMap(authCodes, now);
  deleteExpiredFromMap(accessTokens, now);
  deleteExpiredFromMap(pendingAuthorizeRequests, now);
  deleteExpiredFromMap(fakeLoginSessions, now);
}

// Agenda a limpeza periódica em background. `unref()` evita que este timer, sozinho,
// mantenha o processo Node.js vivo (ex.: durante testes ou scripts que devem encerrar).
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

// Atenção: retorna "{}" (objeto vazio) quando a chave não existe, em vez de
// `undefined`. Como "{}" é truthy, chamadores que fazem `if (!getAuthCode(...))`
// não conseguem detectar a ausência do registro (mesmo padrão presente nos demais
// getters deste arquivo). Ver Sugestões de melhoria.
function getAuthCode(code) {
  return authCodes.get(code) || {};
}

function deleteAuthCode(code) {
  authCodes.delete(code);
}

function saveAccessToken(token, accessToken) {
  accessTokens.set(token, accessToken);
  return accessToken;
}

function getAccessToken(token) {
  return accessTokens.get(token) || {};
}

function deleteAccessToken(token) {
  accessTokens.delete(token);
}

function savePendingAuthorizeRequest(id, request) {
  pendingAuthorizeRequests.set(id, request);
  return request;
}

function getPendingAuthorizeRequest(id) {
  return pendingAuthorizeRequests.get(id) || {};
}

function deletePendingAuthorizeRequest(id) {
  pendingAuthorizeRequests.delete(id);
}

function saveFakeLoginSession(id, session) {
  fakeLoginSessions.set(id, session);
  return session;
}

function getFakeLoginSession(id) {
  return fakeLoginSessions.get(id) || {};
}

function deleteFakeLoginSession(id) {
  fakeLoginSessions.delete(id);
}

module.exports = {
  authCodes,
  accessTokens,
  pendingAuthorizeRequests,
  fakeLoginSessions,
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
  deletePendingAuthorizeRequest,
  saveFakeLoginSession,
  getFakeLoginSession,
  deleteFakeLoginSession
};