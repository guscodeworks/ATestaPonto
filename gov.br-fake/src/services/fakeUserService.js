'use strict';

const { fakeUsers } = require('../config/fakeUsers');

const fakeUsersBySub = new Map(fakeUsers.map((user) => [user.sub, user]));

function normalizeSub(value) {
  return String(value || '').replace(/\D/g, '');
}

function findBySub(sub) {
  return fakeUsersBySub.get(normalizeSub(sub)) || null;
}

function authenticate({ sub, password }) {
  const user = findBySub(sub);
  const receivedPassword = String(password || '');

  if (!user || user.password !== receivedPassword) {
    return null;
  }

  return user;
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
