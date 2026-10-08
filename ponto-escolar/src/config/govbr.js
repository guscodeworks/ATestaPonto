"use strict";

const env = require("./env");

function getGovbrConfig() {
  // Gov.br autentica a identidade; o cadastro administrativo autoriza o acesso.
  return Object.freeze({
    authorizeUrl: env.GOVBR_AUTHORIZE_URL,
    tokenUrl: env.GOVBR_TOKEN_URL,
    userInfoUrl: env.GOVBR_USERINFO_URL,
    clientId: env.GOVBR_CLIENT_ID,
    clientSecret: env.GOVBR_CLIENT_SECRET,
    redirectUri: env.GOVBR_REDIRECT_URI,
  });
}

module.exports = {
  getGovbrConfig,
};