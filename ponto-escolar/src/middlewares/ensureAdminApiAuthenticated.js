"use strict";

const { UnauthorizedError } = require("../utils/errors");
const {
  verificarSeUsuarioGovbrEhAdmin,
} = require("../services/adminAuthorization.service");

/**
 * Protege APIs administrativas com sessao Gov.br e autorizacao interna.
 */
function ensureAdminApiAuthenticated(req, _res, next) {
  const admin = req.session && req.session.admin;
  const sub = String((admin && admin.sub) || "").trim();

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
  // Controladores antigos leem req.user; APIs novas usam req.auth como contrato.
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
