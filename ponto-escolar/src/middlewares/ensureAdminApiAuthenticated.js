'use strict';

const { UnauthorizedError } = require('../utils/errors');

function ensureAdminApiAuthenticated(req, _res, next) {
  const admin = req.session && req.session.admin;
  const sub = String(admin && admin.sub || '').trim();

  if (!admin || admin.authProvider !== 'govbr' || !sub) {
    return next(new UnauthorizedError('Sessao administrativa Gov.br obrigatoria'));
  }

  req.user = admin;
  req.auth = {
    id: sub,
    sub,
    nome: admin.name || null,
    email: admin.email || null,
    role: 'admin',
    authProvider: admin.authProvider
  };

  return next();
}

module.exports = ensureAdminApiAuthenticated;
