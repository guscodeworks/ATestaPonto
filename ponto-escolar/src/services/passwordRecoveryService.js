"use strict";

const bcrypt = require("bcrypt");
const crypto = require("crypto");
const env = require("../config/env");
const employeeModel = require("../models/employeeModel");
const { sendPasswordRecoveryCode } = require("./emailService");
const { registerAuditLog } = require("./auditLogService");
const { BadRequestError, UnauthorizedError } = require("../utils/errors");

const RECOVERY_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function isFirstAccess(value) {
  return value === true || value === 1 || value === "1";
}

function hashCode(code) {
  return crypto
    .createHash("sha256")
    .update(`${code}:${env.SESSION_SECRET}`)
    .digest("hex");
}

function codesMatch(expected, received) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(hashCode(received), "hex");
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function clearRecovery(session) {
  delete session.passwordRecovery;
}

async function requestRecovery({ cpf, session, ipOrigem }) {
  clearRecovery(session);
  const employee = await employeeModel.findForPasswordRecoveryByCpf(cpf);

  // Resposta é propositalmente igual, com ou sem conta: evita enumerar CPFs.
  if (!employee || !employee.email || isFirstAccess(employee.primeiro_acesso)) {
    return { message: "Se houver uma conta ativa com este CPF, enviaremos um código para o e-mail cadastrado." };
  }

  const codigo = String(crypto.randomInt(100000, 1000000));
  session.passwordRecovery = {
    employeeId: Number(employee.id),
    codeHash: hashCode(codigo),
    expiresAt: Date.now() + RECOVERY_TTL_MS,
    attempts: 0,
    verified: false,
  };

  await sendPasswordRecoveryCode({ nome: employee.nome, email: employee.email, codigo });
  await registerAuditLog({
    evento: "recuperacao_senha_solicitada",
    funcionarioId: employee.id,
    nivel: "INFO",
    mensagem: "Código de recuperação de senha solicitado",
    ipOrigem,
  });

  return { message: "Se houver uma conta ativa com este CPF, enviaremos um código para o e-mail cadastrado." };
}

function getActiveRecovery(session) {
  const recovery = session.passwordRecovery;
  if (!recovery || Date.now() > Number(recovery.expiresAt)) {
    clearRecovery(session);
    throw new UnauthorizedError("Código expirado. Solicite um novo código.");
  }
  return recovery;
}

function verifyRecoveryCode({ codigo, session }) {
  const recovery = getActiveRecovery(session);
  if (recovery.attempts >= MAX_CODE_ATTEMPTS || !codesMatch(recovery.codeHash, codigo)) {
    recovery.attempts = Number(recovery.attempts || 0) + 1;
    if (recovery.attempts >= MAX_CODE_ATTEMPTS) clearRecovery(session);
    throw new UnauthorizedError("Código inválido ou expirado.");
  }

  recovery.verified = true;
  return { message: "Código confirmado." };
}

async function resetPassword({ novaSenha, session, ipOrigem }) {
  const recovery = getActiveRecovery(session);
  if (!recovery.verified) {
    throw new UnauthorizedError("Confirme o código antes de redefinir a senha.");
  }

  const passwordHash = await bcrypt.hash(novaSenha, env.BCRYPT_SALT_ROUNDS);
  const updateResult = await employeeModel.updatePasswordForRecovery(
    Number(recovery.employeeId),
    passwordHash
  );

  // Evita que uma sessão de recuperação iniciada antes de uma mudança de
  // estado contorne a troca obrigatória de primeiro acesso.
  if (Number(updateResult?.affectedRows) !== 1) {
    clearRecovery(session);
    throw new UnauthorizedError("Nao foi possivel redefinir a senha.");
  }

  clearRecovery(session);
  await registerAuditLog({
    evento: "senha_funcionario_redefinida",
    funcionarioId: Number(recovery.employeeId),
    nivel: "INFO",
    mensagem: "Senha de funcionário redefinida por recuperação de acesso",
    ipOrigem,
  });

  return { message: "Senha atualizada com sucesso." };
}

module.exports = { requestRecovery, verifyRecoveryCode, resetPassword };
