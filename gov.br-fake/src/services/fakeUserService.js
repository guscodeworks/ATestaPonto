'use strict';

const { configurableAdminUser, fakeUsers } = require('../config/fakeUsers');
const { timingSafeStringEquals } = require('../utils/crypto');

const fakeUsersBySub = new Map();

// Indexa cada identidade fictícia pelo `sub` interno. A versão somente numérica é
// mantida como compatibilidade para registros antigos, mas nunca é aceita no login.
fakeUsers.forEach((user) => {
  fakeUsersBySub.set(user.sub, user);
  const normalizedSub = normalizeSub(user.sub);
  if (normalizedSub) {
    fakeUsersBySub.set(normalizedSub, user);
  }
});

function normalizeSub(value) {
  return String(value || '').replace(/\D/g, '');
}

function findBySub(sub) {
  const rawSub = String(sub || '').trim();
  if (!rawSub) {
    return null;
  }

  return fakeUsersBySub.get(rawSub) || fakeUsersBySub.get(normalizeSub(rawSub)) || null;
}

function authenticate({ login, password }) {
  const receivedLogin = String(login || '').trim();
  const receivedPassword = String(password || '');
  const loginMatches = timingSafeStringEquals(receivedLogin, configurableAdminUser.login);
  const passwordMatches = timingSafeStringEquals(
    receivedPassword,
    configurableAdminUser.password
  );

  return loginMatches && passwordMatches ? configurableAdminUser : null;
}

function toUserInfo(user) {
  return user && typeof user.toUserInfo === 'function'
    ? user.toUserInfo()
    : null;
}

module.exports = {
  normalizeSub,
  findBySub,
  authenticate,
  toUserInfo
};
