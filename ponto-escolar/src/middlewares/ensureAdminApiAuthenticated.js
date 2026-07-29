"use strict";

const { ForbiddenError, UnauthorizedError } = require("../utils/errors");
const {
  verificarSeUsuarioGovbrEhAdmin,
} = require("../services/adminAuthorization.service");

/**
 * Protege APIs administrativas com sessao Gov.br e autorizacao interna.
 */
function ensureAdminApiAuthenticated(req, _res, next) {
  const admin = req.session && req.session.admin;
  const sub = String((admin && admin.sub) || "").trim();
  const email = String((admin && admin.email) || "").trim();

  // Reavalia a autorização de admin a cada requisição (não confia apenas na sessão
  // já existir), pois o usuário pode ter perdido o privilégio após o login.
  if (
    !admin ||
    admin.authProvider !== "govbr" ||
    (!sub && !email)
  ) {
    return next(
      new UnauthorizedError("Sessao administrativa Gov.br obrigatoria")
    );
  }

  if (!verificarSeUsuarioGovbrEhAdmin(admin)) {
    return next(
      new ForbiddenError("Usuario Gov.br sem autorizacao administrativa")
    );
  }

  req.user = admin;
  // Controladores antigos leem req.user; APIs novas usam req.auth como contrato.
  req.auth = {
    id: sub || email.toLowerCase(),
    sub,
    nome: admin.name || "",
    email,
    role: "admin",
    authProvider: admin.authProvider,
  };

  return next();
}

module.exports = ensureAdminApiAuthenticated;
