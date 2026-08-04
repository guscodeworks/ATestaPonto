'use strict';

const FakeUser = require('../models/FakeUser');
const { env } = require('./env');

// Lista de usuários fictícios usada para simular o fluxo de autenticação
// do govbr em ambientes de desenvolvimento/demonstração, sem depender do provedor real.
// Object.freeze garante que a lista e seus itens não sejam alterados em tempo de execução,
// evitando efeitos colaterais indesejados caso algum consumidor tente mutar os dados.
const configurableAdminUser = new FakeUser({
  sub: env.fakeAdminSub,
  name: env.fakeAdminName,
  email: env.fakeAdminEmail,
  login: env.fakeAdminLogin,
  password: env.fakeAdminPassword
});

const commonDemoUser = new FakeUser({
  sub: '99988877766',
  name: 'Usuario Comum Demo',
  email: 'usuario.demo@govbr.fake'
});

const fakeUsers = Object.freeze([
  // Usuário "admin" configurável via variáveis de ambiente, permitindo customizar
  // as credenciais de demonstração por ambiente (dev, staging, etc.) sem alterar o código.
  configurableAdminUser,
  commonDemoUser
]);

module.exports = {
  fakeUsers,
  configurableAdminUser
};
