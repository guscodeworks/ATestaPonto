'use strict';

const { verificarSeUsuarioGovbrEhAdmin } = require('../services/adminAuthorization.service');

function ensureAdminAuthenticated(req, res, next) {
  const admin = req.session && req.session.admin;

  if (
    !admin ||
    admin.authProvider !== 'govbr' ||
    !verificarSeUsuarioGovbrEhAdmin(admin)
  ) {
    return res.redirect('/auth/govbr/login');
  }

  req.user = admin;
  return next();
}

module.exports = ensureAdminAuthenticated;
