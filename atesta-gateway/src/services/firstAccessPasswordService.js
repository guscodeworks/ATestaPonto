"use strict";

const bcrypt = require("bcrypt");
const env = require("../config/env");
const { updatePassword } = require("./employeeCredentialsService");
const { verifyFirstAccessToken } = require("./firstAccessTokenService");
const { registerAuditLog } = require("./auditLogService");

async function changeFirstAccessPassword({ token, novaSenha, ipOrigem }) {
  // Valida assinatura, expiração e finalidade antes de consultar ou alterar o banco.
  const { funcionarioId } = verifyFirstAccessToken(token);
  const senhaHash = await bcrypt.hash(novaSenha, env.BCRYPT_SALT_ROUNDS);

  await updatePassword("primeiro-acesso", funcionarioId, senhaHash);

  await registerAuditLog({
    evento: "senha_primeiro_acesso_atualizada",
    funcionarioId,
    mensagem: "Senha temporaria substituida no primeiro acesso",
    ipOrigem,
  });

  return {
    primeiro_acesso: false,
    message: "Senha atualizada com sucesso. Faca login novamente.",
  };
}

module.exports = { changeFirstAccessPassword };
