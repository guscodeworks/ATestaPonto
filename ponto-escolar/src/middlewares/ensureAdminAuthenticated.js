"use strict";

const {
  verificarSeUsuarioGovbrEhAdmin,
} = require("../services/adminAuthorization.service");

function ensureAdminAuthenticated(req, res, next) {
  const admin = req.session && req.session.admin;

  // Reavalia a autorização de admin a cada requisição, e não apenas a existência
  // da sessão, pois o usuário pode ter perdido o privilégio após o login.
  // Diferente da versão de API (ensureAdminApiAuthenticated), aqui o acesso é
  // via navegador, então em vez de retornar 401 redireciona para a tela de login.
  if (
    !admin ||
    admin.authProvider !== "govbr" ||
    !verificarSeUsuarioGovbrEhAdmin(admin)
  ) {
    return res.redirect("/auth/govbr/login");
  }

  req.user = admin;
  return next();
}

module.exports = ensureAdminAuthenticated;