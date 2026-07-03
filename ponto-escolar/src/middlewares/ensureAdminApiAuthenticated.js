"use strict";

const { UnauthorizedError } = require("../utils/errors");
const {
  verificarSeUsuarioGovbrEhAdmin,
} = require("../services/adminAuthorization.service");

function ensureAdminApiAuthenticated(req, _res, next) {
  const admin = req.session && req.session.admin;
  const sub = String((admin && admin.sub) || "").trim();

  // Reavalia a autorização de admin a cada requisição (não confia apenas na sessão
  // já existir), pois o usuário pode ter perdido o privilégio após o login.
  if (
    !admin ||
    admin.authProvider !== "govbr" ||
    !sub ||
    !verificarSeUsuarioGovbrEhAdmin(admin)
  ) {
    return next(
      new UnauthorizedError("Sessao administrativa Gov.br obrigatoria")
    );
  }

  req.user = admin;
  req.auth = {
    id: sub,
    sub,
    nome: admin.name || {},
    email: admin.email || {},
    role: "admin",
    authProvider: admin.authProvider,
  };

  return next();
}

module.exports = ensureAdminApiAuthenticated;