'use strict';

const { fakeUsers } = require('../config/fakeUsers');

const fakeUsersBySub = new Map();

// Indexa cada usuário fake tanto pelo "sub" original quanto pela versão normalizada,
// permitindo buscas tolerantes a formatação (ex.: CPF com ou sem pontuação).
fakeUsers.forEach((user) => {
  fakeUsersBySub.set(user.sub, user);
  const normalizedSub = normalizeSub(user.sub);
  if (normalizedSub) {
    fakeUsersBySub.set(normalizedSub, user);
  }
});

// O identificador recebido pela tela fake representa um CPF; pontuação e outros
// caracteres não numéricos são descartados antes da busca.
function normalizeSub(value) {
  return String(value || '').replace(/\D/g, '');
}

function findBySub(sub) {
  const normalizedSub = normalizeSub(sub);
  return normalizedSub ? fakeUsersBySub.get(normalizedSub) || null : null;
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
