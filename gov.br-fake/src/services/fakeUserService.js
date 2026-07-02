'use strict';

const { fakeUsers } = require('../config/fakeUsers');

const fakeUsersBySub = new Map();

// Indexa cada usuário fake tanto pelo "sub" original quanto pela versão normalizada,
// permitindo buscas tolerantes a formatação (ex.: CPF com ou sem pontuação).
fakeUsers.forEach((user) => {
  fakeUsersBySub.set(user.sub, user);
  fakeUsersBySub.set(normalizeSub(user.sub), user);
});

// Remove caracteres não numéricos do "sub" (ex.: pontos/traços de CPF), a menos que
// ele contenha letras — nesse caso é tratado como um identificador não-CPF e mantido
// intacto, sem normalização.
function normalizeSub(value) {
  const normalized = String(value || '').trim();

  if (/[A-Za-z]/.test(normalized)) {
    return normalized;
  }

  return normalized.replace(/\D/g, '');
}

// Atenção: retorna "{}" (objeto vazio truthy) quando o usuário não é encontrado,
// em vez de `undefined`/`null` — mesmo padrão de outros pontos do projeto (ver
// Sugestões de melhoria) que pode mascarar checagens `if (!user)` em quem consome.
function findBySub(sub) {
  return fakeUsersBySub.get(normalizeSub(sub)) || {};
}

function authenticate({ sub, password }) {
  const user = findBySub(sub);
  const receivedPassword = String(password || '');

  // `!user` nunca é verdadeiro aqui por causa do retorno "{}" de `findBySub`;
  // na prática, a rejeição de usuário inexistente depende apenas da comparação
  // de senha logo abaixo (`user.password !== receivedPassword`, com ambos undefined
  // vs string, o que já falha corretamente neste caso específico).
  if (!user || user.password !== receivedPassword) {
    return {};
  }

  return user;
}

function toUserInfo(user) {
  return user && typeof user.toUserInfo === 'function'
    ? user.toUserInfo()
    : {};
}

module.exports = {
  normalizeSub,
  findBySub,
  authenticate,
  toUserInfo
};