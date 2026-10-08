"use strict";

const { revalidateAdminContext } = require("./revalidateAdminContext");

/**
 * Protege paginas admin: Gov.br autentica, ATestaPonto autoriza.
 */
function ensureAdminAuthenticated(req, res, next) {
  const adminSession = req.session && req.session.admin;

  // Verifica se existe sessao administrativa Gov.br
  if (
    !adminSession ||
    adminSession.authProvider !== "govbr" ||
    !adminSession.id
  ) {
    return res.redirect("/auth/govbr/login");
  }

  // Busca o administrativo real e seus acessos via service para revalidar a sessão.
  revalidateAdminContext(req, adminSession.id)
    .then((adminFromDb) => {
      if (!adminFromDb) {
        return res.redirect("/auth/govbr/login");
      }

      if (!adminFromDb.ativo) {
        return res.redirect("/auth/govbr/login");
      }

      return next();
    })
    .catch((error) => {
      return res.redirect("/auth/govbr/login");
    });
}

module.exports = ensureAdminAuthenticated;
