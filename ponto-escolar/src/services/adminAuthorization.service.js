"use strict";

const { getGovbrConfig } = require("../config/govbr");

// Regra de negócio: um usuário Gov.br é considerado admin se seu "sub" (identificador
// único do Gov.br) ou seu email estiver na lista de admins configurada (allowlist),
// definida externamente via getGovbrConfig.
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