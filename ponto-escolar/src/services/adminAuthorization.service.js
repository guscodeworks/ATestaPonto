"use strict";

const { getGovbrConfig } = require("../config/govbr");

// Autorização fica interna: o provedor (Gov.br) nunca define perfil admin aqui.
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