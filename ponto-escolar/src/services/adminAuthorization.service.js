"use strict";

const { getGovbrConfig } = require("../config/govbr");

/**
 * Confere se a identidade autenticada pelo Gov.br tem permissao no ATestaPonto.
 * A autorizacao fica interna para evitar que o provedor defina perfil admin.
 */
function verificarSeUsuarioGovbrEhAdmin(userInfo) {
  const { adminSubs, adminEmails } = getGovbrConfig();
  const userSub = String((userInfo && userInfo.sub) || "").trim();
  const userEmail = String((userInfo && userInfo.email) || "")
    .trim()
    .toLowerCase();

  return Boolean(
    (userSub && adminSubs.includes(userSub)) ||
      (userEmail && adminEmails.includes(userEmail))
  );
}

module.exports = {
  verificarSeUsuarioGovbrEhAdmin,
};