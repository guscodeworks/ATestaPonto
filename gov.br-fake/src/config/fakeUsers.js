'use strict';

const FakeUser = require('../models/FakeUser');

const fakeUsers = Object.freeze([
  new FakeUser({
    sub: '11122233344',
    name: 'Servidor Admin Demo',
    email: 'admin.demo@govbr.fake',
    password: 'demo123'
  }),
  new FakeUser({
    sub: '99988877766',
    name: 'Usuario Comum Demo',
    email: 'usuario.demo@govbr.fake',
    password: 'demo123'
  })
]);

module.exports = {
  fakeUsers
};
