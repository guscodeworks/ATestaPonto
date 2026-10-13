"use strict";

const employeeModel = require("../models/employeeModel");
const crypto = require("node:crypto");
const env = require("../config/env");
const { UnauthorizedError } = require("../utils/errors");

// O hash persistido muda em cada troca/recuperação (bcrypt usa salt novo).
// HMAC evita publicar no JWT o hash de senha ou um derivado não autenticado dele.
function buildCredentialVersion(funcionario) {
  if (typeof funcionario?.senha_hash !== "string" || !funcionario.senha_hash) {
    throw new UnauthorizedError("Credencial indisponivel. Faca login novamente.");
  }
  return crypto.createHmac("sha256", env.JWT_SECRET)
    .update(JSON.stringify(["employee-credential-v1", String(funcionario.id), funcionario.senha_hash]))
    .digest("hex");
}

async function findUserByToken(funcionarioId, credentialVersion) {
  if (typeof credentialVersion !== "string" || !/^[a-f0-9]{64}$/.test(credentialVersion)) {
    throw new UnauthorizedError("Sessao invalidada. Faca login novamente.");
  }
  const funcionario = await employeeModel.findForTokenValidationById(funcionarioId);
  if (!funcionario) return null;

  const expected = Buffer.from(buildCredentialVersion(funcionario), "hex");
  if (!crypto.timingSafeEqual(expected, Buffer.from(credentialVersion, "hex"))) {
    throw new UnauthorizedError("Sessao invalidada. Faca login novamente.");
  }
  const { senha_hash, ...identity } = funcionario;
  return identity;
}

module.exports = {
  findUserByToken,
  buildCredentialVersion,
};
