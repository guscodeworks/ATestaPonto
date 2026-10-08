"use strict";

const { ForbiddenError, UnauthorizedError } = require("../utils/errors");
const { revalidateAdminContext } = require("./revalidateAdminContext");

/**
 * Protege APIs administrativas com sessao Gov.br e autorizacao interna.
 */
function ensureAdminApiAuthenticated(req, _res, next) {
  const adminSession = req.session && req.session.admin;

  // Verifica se existe sessao administrativa Gov.br
  if (
    !adminSession ||
    adminSession.authProvider !== "govbr" ||
    !adminSession.id
  ) {
    return next(
      new UnauthorizedError("Sessao administrativa Gov.br obrigatoria")
    );
  }

  // Busca o administrativo real e seus acessos via service para revalidar a sessão.
  revalidateAdminContext(req, adminSession.id)
    .then((adminFromDb) => {
      if (!adminFromDb) {
        return next(
          new UnauthorizedError("Administrativo nao encontrado no sistema")
        );
      }

      if (!adminFromDb.ativo) {
        return next(
          new ForbiddenError("Administrativo inativo")
        );
      }

      req.auth = {
        id: adminFromDb.id,
        nome: adminFromDb.nome || "",
        email: adminFromDb.email,
        role: "admin",
        authProvider: "govbr",
      };

      return next();
    })
    .catch((error) => {
      return next(
        new UnauthorizedError("Falha ao validar sessao administrativa")
      );
    });
}

module.exports = ensureAdminApiAuthenticated;
