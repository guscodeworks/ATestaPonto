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

// Identidades exclusivamente locais para os cenários de autorização do
// ponto-escolar. O perfil administrativo continua sendo resolvido pelo banco
// da aplicação principal; o simulador entrega somente a identidade Gov.br.
const localAdministrativeTestUsers = Object.freeze([
  new FakeUser({
    sub: '10000000019',
    name: 'Helena Martins',
    email: 'helena.martins@govbr.fake',
    login: 'adminseduc',
    password: 'admin123'
  }),
  new FakeUser({
    sub: '10000000108',
    name: 'Ricardo Almeida',
    email: 'ricardo.almeida@govbr.fake',
    login: 'admindre1',
    password: 'admin123'
  }),
  new FakeUser({
    sub: '10000000280',
    name: 'Patrícia Nogueira',
    email: 'patricia.nogueira@govbr.fake',
    login: 'admindre2',
    password: 'admin123'
  }),
  new FakeUser({
    sub: '10000000361',
    name: 'Camila Ferreira',
    email: 'camila.ferreira@govbr.fake',
    login: 'vicediretor',
    password: 'admin123'
  }),
  new FakeUser({
    sub: '10000000442',
    name: 'Juliana Costa',
    email: 'juliana.costa@govbr.fake',
    login: 'secretaria',
    password: 'admin123'
  }),
  new FakeUser({
    sub: '10000000523',
    name: 'André Moreira',
    email: 'andre.moreira@govbr.fake',
    login: 'coordenador',
    password: 'admin123'
  })
]);

const fakeUsers = Object.freeze([
  // Usuário "admin" configurável via variáveis de ambiente, permitindo customizar
  // as credenciais de demonstração por ambiente (dev, staging, etc.) sem alterar o código.
  configurableAdminUser,
  ...localAdministrativeTestUsers,
  commonDemoUser
]);

module.exports = {
  fakeUsers,
  configurableAdminUser,
  localAdministrativeTestUsers
};
