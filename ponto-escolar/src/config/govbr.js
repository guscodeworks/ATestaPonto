"use strict";

const env = require("./env");

function getGovbrConfig() {
  // Gov.br autentica a identidade; Ponto Escolar autoriza o admin.
  // Ou seja: o gov.br apenas confirma quem é a pessoa (login/identidade);
  // é responsabilidade deste sistema decidir se essa identidade tem
  // permissão de admin, comparando com adminSubs/adminEmails abaixo.
  return Object.freeze({
    authorizeUrl: env.GOVBR_AUTHORIZE_URL,
    tokenUrl: env.GOVBR_TOKEN_URL,
    userInfoUrl: env.GOVBR_USERINFO_URL,
    clientId: env.GOVBR_CLIENT_ID,
    clientSecret: env.GOVBR_CLIENT_SECRET,
    redirectUri: env.GOVBR_REDIRECT_URI,
    adminSubs: env.ADMIN_GOVBR_SUBS,
    adminEmails: env.ADMIN_GOVBR_EMAILS,
    // Nota: config é congelada aqui, mas isso não protege os valores dos
    // objetos internos (arrays adminSubs/adminEmails), já que env já os
    // congela na origem (Object.freeze em env.js).
  });
}

module.exports = {
  getGovbrConfig,
};