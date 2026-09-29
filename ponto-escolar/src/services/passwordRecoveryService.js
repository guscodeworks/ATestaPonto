"use strict";

const bcrypt = require("bcrypt");
const crypto = require("crypto");
const env = require("../config/env");
const employeeModel = require("../models/employeeModel");
const { sendPasswordRecoveryCode } = require("./emailService");
const { registerAuditLog } = require("./auditLogService");
const { UnauthorizedError } = require("../utils/errors");
const { logger, safeErrorContext } = require("../utils/logger");
const { digestSubject, loginSubject } = require("../utils/rateLimitSubject");

const RECOVERY_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

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

  const canRecover = Boolean(employee && employee.email);
  const codigo = String(crypto.randomInt(100000, 1000000));
  // Mesmo ciclo de sessão/cookie e tentativas, sem autorizar conta inexistente.
  session.passwordRecovery = {
    authorizationId: crypto.randomBytes(32).toString("hex"),
    rateLimitSubject: digestSubject(loginSubject({ cpf })),
    employeeId: canRecover ? Number(employee.id) : null,
    codeHash: hashCode(codigo),
    expiresAt: Date.now() + RECOVERY_TTL_MS,
    attempts: 0,
    verified: false,
  };

  return {
    data: { message: "Se houver uma conta ativa com este CPF, enviaremos um código para o e-mail cadastrado." },
    // O controller chama após persistir a sessão e concluir a resposta pública.
    // Não inclui destinatário/código em data nem depende do SMTP para responder.
    async deliver() {
      try {
        if (canRecover) {
          await sendPasswordRecoveryCode({ nome: employee.nome, email: employee.email, codigo });
        }
        await registerAuditLog({
          evento: "recuperacao_senha_solicitada",
          funcionarioId: canRecover ? employee.id : null,
          nivel: "INFO",
          mensagem: "Solicitação de recuperação de senha recebida",
          ipOrigem,
        });
      } catch (error) {
        logger.error("Falha no processamento da recuperacao de senha", { error: safeErrorContext(error) });
      }
    },
  };
}

function getActiveRecovery(session) {
  const recovery = session.passwordRecovery;
  if (!recovery || Date.now() > Number(recovery.expiresAt)) {
    clearRecovery(session);
    throw new UnauthorizedError("Código inválido ou expirado.");
  }
  return recovery;
}

function verifyRecoveryCode({ codigo, session }) {
  const recovery = getActiveRecovery(session);
  const matches = codesMatch(recovery.codeHash, codigo);
  if (recovery.attempts >= MAX_CODE_ATTEMPTS || !matches ||
      !Number.isSafeInteger(recovery.employeeId) || recovery.employeeId <= 0) {
    recovery.attempts = Number(recovery.attempts || 0) + 1;
    if (recovery.attempts >= MAX_CODE_ATTEMPTS) clearRecovery(session);
    throw new UnauthorizedError("Código inválido ou expirado.");
  }

  recovery.verified = true;
  return { message: "Código confirmado." };
}

function consumePasswordRecovery(sessionStore, sessionId, recovery) {
  if (
    !sessionStore ||
    typeof sessionStore.consumePasswordRecovery !== "function" ||
    typeof sessionId !== "string" ||
    sessionId.length === 0
  ) {
    throw new Error("Password recovery store does not support atomic consumption");
  }

  return new Promise((resolve, reject) => {
    sessionStore.consumePasswordRecovery(
      sessionId,
      {
        authorizationId: recovery.authorizationId,
        employeeId: recovery.employeeId,
      },
      (error, consumed) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(consumed === true);
      }
    );
  });
}

async function resetPassword({
  novaSenha,
  session,
  sessionId,
  sessionStore,
  ipOrigem,
}) {
  const recovery = getActiveRecovery(session);
  if (!recovery.verified || !Number.isSafeInteger(recovery.employeeId) || recovery.employeeId <= 0) {
    throw new UnauthorizedError("Confirme o código antes de redefinir a senha.");
  }

  const employeeId = Number(recovery.employeeId);
  const consumed = await consumePasswordRecovery(
    sessionStore,
    sessionId,
    recovery
  );
  clearRecovery(session);
  if (!consumed) {
    throw new UnauthorizedError("Código inválido ou expirado.");
  }

  const passwordHash = await bcrypt.hash(novaSenha, env.BCRYPT_SALT_ROUNDS);
  await employeeModel.updatePasswordForRecovery(
    employeeId,
    passwordHash
  );
  await registerAuditLog({
    evento: "senha_funcionario_redefinida",
    funcionarioId: employeeId,
    nivel: "INFO",
    mensagem: "Senha de funcionário redefinida por recuperação de acesso",
    ipOrigem,
  });

  return { message: "Senha atualizada com sucesso." };
}

module.exports = { requestRecovery, verifyRecoveryCode, resetPassword };
