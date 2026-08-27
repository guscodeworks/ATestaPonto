"use strict";

const bcrypt = require("bcrypt");
const env = require("../config/env");
const employeeModel = require("../models/employeeModel");
const loginModel = require("../models/loginModel");
const { verifyFirstAccessToken } = require("./firstAccessTokenService");
const { registerAuditLog } = require("./auditLogService");
const { ConflictError, UnauthorizedError } = require("../utils/errors");

function isFirstAccess(value) {
  return value === true || value === 1 || value === "1";
}

function isActive(value) {
  return value === true || value === 1 || value === "1";
}

async function changeFirstAccessPassword({ token, novaSenha, ipOrigem }) {
  // Valida assinatura, expiração e finalidade antes de consultar ou alterar o banco.
  const { funcionarioId } = verifyFirstAccessToken(token);
  const senhaHash = await bcrypt.hash(novaSenha, env.BCRYPT_SALT_ROUNDS);

  await employeeModel.withTransaction(async (tx) => {
    const login = await loginModel.findFirstAccessByFuncionarioIdForUpdate(
      tx,
      funcionarioId
    );

    if (!login || !isActive(login.ativo)) {
      throw new UnauthorizedError("Comprovante de primeiro acesso invalido");
    }

    if (!isFirstAccess(login.primeiro_acesso)) {
      throw new ConflictError("O primeiro acesso ja foi concluido");
    }

    const result = await loginModel.updateSenha(tx, funcionarioId, senhaHash);
    if (Number(result?.affectedRows) !== 1) {
      throw new ConflictError("O primeiro acesso ja foi concluido");
    }
  });

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
