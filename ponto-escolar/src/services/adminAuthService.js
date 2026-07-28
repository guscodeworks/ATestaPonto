"use strict";

const { UnauthorizedError } = require("../utils/errors");

function localAdminAuthUnavailable() {
  throw new UnauthorizedError(
    "Autenticacao administrativa local desativada. Use o acesso Gov.br."
  );
}

async function loginAdmin() {
  return localAdminAuthUnavailable();
}

async function getAdminProfile() {
  return localAdminAuthUnavailable();
}

module.exports = {
  loginAdmin,
  getAdminProfile,
};
