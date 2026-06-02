'use strict';

function ensureAdminAuthenticated(req, res, next) {
  if (
    !req.session ||
    !req.session.admin ||
    req.session.admin.authProvider !== 'govbr'
  ) {
    return res.redirect('/admin/auth/start');
  }

  req.user = req.session.admin;
  return next();
}

module.exports = ensureAdminAuthenticated;
