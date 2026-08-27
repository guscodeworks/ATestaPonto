"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

Object.assign(process.env, {
  NODE_ENV: "test",
  REDIS_ENABLED: "false",
  DB_HOST: "127.0.0.1",
  DB_USER: "test",
  DB_NAME: "test",
  JWT_SECRET: "TestJwtSecret-FirstAccess-123456789!",
  JWT_EXPIRES_IN: "8h",
  SESSION_SECRET: "TestSessionSecret-FirstAccess-987654321!",
  CORS_ORIGIN: "http://127.0.0.1:3000",
  ADMIN_GOVBR_EMAILS: "admin@example.test",
  GOVBR_FAKE_BASE_URL: "http://127.0.0.1:4000",
  GOVBR_FAKE_CLIENT_ID: "test-client",
  GOVBR_FAKE_CLIENT_SECRET: "test-client-secret",
  GOVBR_FAKE_REDIRECT_URI: "http://127.0.0.1:3000/auth/govbr/callback",
  MAIL_ENABLED: "false",
});

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const env = require("../src/config/env");
const employeeModel = require("../src/models/employeeModel");
const loginModel = require("../src/models/loginModel");
const authService = require("../src/services/authService");
const punchService = require("../src/services/punchService");
const firstAccessPasswordService = require("../src/services/firstAccessPasswordService");
const passwordRecoveryService = require("../src/services/passwordRecoveryService");
const {
  createFirstAccessToken,
  verifyFirstAccessToken,
} = require("../src/services/firstAccessTokenService");
const { authenticateFuncionario } = require("../src/middlewares/authMiddleware");
const { passwordRecoveryResetValidator } = require("../src/middlewares/validators");
const { sanitizeForLog } = require("../src/utils/logger");

const originalMethods = {
  findForPunchLoginByCpf: employeeModel.findForPunchLoginByCpf,
  hasModernLoginTable: employeeModel.hasModernLoginTable,
  findForPasswordRecoveryByCpf: employeeModel.findForPasswordRecoveryByCpf,
  updatePasswordForRecovery: employeeModel.updatePasswordForRecovery,
  withTransaction: employeeModel.withTransaction,
  updateLastLogin: loginModel.updateLastLogin,
  findFirstAccessByFuncionarioIdForUpdate:
    loginModel.findFirstAccessByFuncionarioIdForUpdate,
  updateSenha: loginModel.updateSenha,
  findUserByToken: authService.findUserByToken,
};

function restoreModels() {
  Object.assign(employeeModel, {
    findForPunchLoginByCpf: originalMethods.findForPunchLoginByCpf,
    hasModernLoginTable: originalMethods.hasModernLoginTable,
    findForPasswordRecoveryByCpf:
      originalMethods.findForPasswordRecoveryByCpf,
    updatePasswordForRecovery: originalMethods.updatePasswordForRecovery,
    withTransaction: originalMethods.withTransaction,
  });
  loginModel.updateLastLogin = originalMethods.updateLastLogin;
  loginModel.findFirstAccessByFuncionarioIdForUpdate =
    originalMethods.findFirstAccessByFuncionarioIdForUpdate;
  loginModel.updateSenha = originalMethods.updateSenha;
  authService.findUserByToken = originalMethods.findUserByToken;
}

function runMiddlewares(middlewares, req) {
  return new Promise((resolve) => {
    let index = 0;
    const next = (error) => {
      if (error || index === middlewares.length) {
        return resolve(error);
      }
      const middleware = middlewares[index++];
      Promise.resolve(middleware(req, {}, next)).catch(next);
    };
    next();
  });
}

function authenticate(token) {
  return new Promise((resolve) => {
    authenticateFuncionario(
      { headers: { authorization: `Bearer ${token}` } },
      null,
      resolve
    );
  });
}

test.afterEach(restoreModels);

test("primeiro acesso valida senha temporaria e emite apenas comprovante restrito", async () => {
  let lastLoginUpdated = false;
  employeeModel.findForPunchLoginByCpf = async () => ({
    id: 42,
    nome: "Ana Silva",
    email: "ana@example.test",
    cpf: "52998224725",
    senha_hash: await bcrypt.hash("Senha@123", 4),
    primeiro_acesso: 1,
    ativo: 1,
  });
  employeeModel.hasModernLoginTable = async () => false;
  loginModel.updateLastLogin = async () => {
    lastLoginUpdated = true;
  };

  const result = await punchService.loginFuncionario({
    identificador: "529.982.247-25",
    senha: "Senha@123",
  });

  assert.equal(result.primeiro_acesso, true);
  assert.equal("token" in result, false);
  assert.equal("senha" in result, false);
  assert.ok(result.token_primeiro_acesso);
  assert.equal(lastLoginUpdated, false);
  assert.deepEqual(verifyFirstAccessToken(result.token_primeiro_acesso), {
    funcionarioId: 42,
  });
  assert.throws(() => jwt.verify(result.token_primeiro_acesso, env.JWT_SECRET));
});

test("login normal emite JWT de funcionario", async () => {
  let lastLoginUpdated = false;
  employeeModel.findForPunchLoginByCpf = async () => ({
    id: 43,
    nome: "Bruno Souza",
    email: "bruno@example.test",
    cpf: "52998224725",
    senha_hash: await bcrypt.hash("Senha@123", 4),
    primeiro_acesso: 0,
    ativo: 1,
  });
  employeeModel.hasModernLoginTable = async () => false;
  loginModel.updateLastLogin = async () => {
    lastLoginUpdated = true;
  };

  const result = await punchService.loginFuncionario({
    identificador: "52998224725",
    senha: "Senha@123",
  });

  assert.equal(result.primeiro_acesso, false);
  assert.ok(result.token);
  assert.equal("token_primeiro_acesso" in result, false);
  assert.equal(lastLoginUpdated, true);
  assert.equal(jwt.verify(result.token, env.JWT_SECRET).role, "funcionario");
  assert.equal("senha" in result, false);
});

test("primeiro acesso nao consegue autenticar nas rotas protegidas", async () => {
  authService.findUserByToken = async () => ({
    id: 42,
    nome: "Ana Silva",
    email: "ana@example.test",
    cpf: "52998224725",
    ativo: 1,
    primeiro_acesso: 1,
  });
  const legacyNormalToken = jwt.sign(
    { sub: "42", role: "funcionario" },
    env.JWT_SECRET,
    { expiresIn: "5m" }
  );

  const error = await authenticate(legacyNormalToken);

  assert.equal(error.statusCode, 403);
  assert.equal(error.code, "FORBIDDEN");

  const restrictedError = await authenticate(createFirstAccessToken(42));
  assert.equal(restrictedError.statusCode, 401);
  assert.equal(restrictedError.code, "UNAUTHORIZED");
});

test("apos concluir o primeiro acesso, JWT normal volta a permitir rota protegida", async () => {
  authService.findUserByToken = async () => ({
    id: 42,
    nome: "Ana Silva",
    email: "ana@example.test",
    cpf: "52998224725",
    ativo: 1,
    primeiro_acesso: 0,
  });
  const tokenNormal = jwt.sign(
    { sub: "42", role: "funcionario" },
    env.JWT_SECRET,
    { expiresIn: "5m" }
  );

  assert.equal(await authenticate(tokenNormal), undefined);
});

test("troca obrigatoria atualiza o hash e encerra primeiro_acesso atomicamente", async () => {
  const persistedLogin = {
    funcionario_id: 42,
    ativo: 1,
    primeiro_acesso: 1,
    senha_hash: await bcrypt.hash("Temporaria@123", 4),
  };
  let updateCalled = false;
  employeeModel.withTransaction = async (callback) => callback({ transaction: true });
  loginModel.findFirstAccessByFuncionarioIdForUpdate = async (_tx, id) => {
    assert.equal(id, 42);
    return persistedLogin;
  };
  loginModel.updateSenha = async (_tx, id, senhaHash) => {
    assert.equal(id, 42);
    updateCalled = true;
    persistedLogin.senha_hash = senhaHash;
    persistedLogin.primeiro_acesso = 0;
    return { affectedRows: 1 };
  };

  const result = await firstAccessPasswordService.changeFirstAccessPassword({
    token: createFirstAccessToken(42),
    novaSenha: "NovaSenha@123",
  });

  assert.deepEqual(result, {
    primeiro_acesso: false,
    message: "Senha atualizada com sucesso. Faca login novamente.",
  });
  assert.equal(updateCalled, true);
  assert.equal(persistedLogin.primeiro_acesso, 0);
  assert.equal(
    await bcrypt.compare("NovaSenha@123", persistedLogin.senha_hash),
    true
  );
});

test("recusa comprovante invalido ou expirado antes de consultar o banco", async () => {
  let transactionStarted = false;
  employeeModel.withTransaction = async () => {
    transactionStarted = true;
  };

  await assert.rejects(
    () =>
      firstAccessPasswordService.changeFirstAccessPassword({
        token: "invalido",
        novaSenha: "NovaSenha@123",
      }),
    { name: "UnauthorizedError" }
  );

  const realNow = Date.now;
  let expiredToken;
  try {
    Date.now = () => realNow() - 11 * 60 * 1000;
    expiredToken = createFirstAccessToken(42);
  } finally {
    Date.now = realNow;
  }

  await assert.rejects(
    () =>
      firstAccessPasswordService.changeFirstAccessPassword({
        token: expiredToken,
        novaSenha: "NovaSenha@123",
      }),
    { name: "UnauthorizedError" }
  );

  const jwtComFinalidadeIncorreta = jwt.sign(
    { sub: "42", purpose: "outra_finalidade" },
    env.JWT_SECRET,
    { expiresIn: "5m" }
  );
  await assert.rejects(
    () =>
      firstAccessPasswordService.changeFirstAccessPassword({
        token: jwtComFinalidadeIncorreta,
        novaSenha: "NovaSenha@123",
      }),
    { name: "UnauthorizedError" }
  );
  assert.equal(transactionStarted, false);
});

test("recusa senha invalida pelas regras existentes", async () => {
  const error = await runMiddlewares(passwordRecoveryResetValidator, {
    body: { novaSenha: "curta" },
  });

  assert.equal(error.statusCode, 422);
  assert.equal(error.code, "VALIDATION_ERROR");
});

test("nao permite reutilizar comprovante apos primeiro acesso concluido", async () => {
  let updateCalled = false;
  employeeModel.withTransaction = async (callback) => callback({ transaction: true });
  loginModel.findFirstAccessByFuncionarioIdForUpdate = async () => ({
    funcionario_id: 42,
    ativo: 1,
    primeiro_acesso: 0,
  });
  loginModel.updateSenha = async () => {
    updateCalled = true;
    return { affectedRows: 1 };
  };

  await assert.rejects(
    () =>
      firstAccessPasswordService.changeFirstAccessPassword({
        token: createFirstAccessToken(42),
        novaSenha: "NovaSenha@123",
        funcionarioId: 999,
        primeiro_acesso: true,
      }),
    { name: "ConflictError" }
  );
  assert.equal(updateCalled, false);
});

test("update atomico grava hash e encerra primeiro_acesso no banco", async () => {
  let executed;
  const transaction = {
    execute: async (sql, params) => {
      executed = { sql, params };
      return { affectedRows: 1 };
    },
  };

  const result = await originalMethods.updateSenha(transaction, 42, "novo-hash");

  assert.equal(result.affectedRows, 1);
  assert.match(executed.sql, /senha_hash = \?/);
  assert.match(executed.sql, /primeiro_acesso = FALSE/);
  assert.match(executed.sql, /WHERE funcionario_id = \? AND primeiro_acesso = TRUE/);
  assert.deepEqual(executed.params, ["novo-hash", 42]);
});

test("duas trocas simultaneas permitem somente uma atualizacao", async () => {
  const persistedLogin = { funcionario_id: 42, ativo: 1, primeiro_acesso: 1 };
  let transactionTail = Promise.resolve();
  let updates = 0;
  employeeModel.withTransaction = async (callback) => {
    const previous = transactionTail;
    let release;
    transactionTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await callback({ transaction: true });
    } finally {
      release();
    }
  };
  loginModel.findFirstAccessByFuncionarioIdForUpdate = async () => persistedLogin;
  loginModel.updateSenha = async () => {
    if (persistedLogin.primeiro_acesso !== 1) {
      return { affectedRows: 0 };
    }
    persistedLogin.primeiro_acesso = 0;
    updates += 1;
    return { affectedRows: 1 };
  };
  const token = createFirstAccessToken(42);

  const results = await Promise.allSettled([
    firstAccessPasswordService.changeFirstAccessPassword({
      token,
      novaSenha: "NovaSenha@123",
    }),
    firstAccessPasswordService.changeFirstAccessPassword({
      token,
      novaSenha: "OutraSenha@123",
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(updates, 1);
  assert.equal(persistedLogin.primeiro_acesso, 0);
});

test("recuperacao de senha nao contorna o primeiro acesso", async () => {
  const session = {};
  employeeModel.findForPasswordRecoveryByCpf = async () => ({
    id: 42,
    nome: "Ana Silva",
    email: "ana@example.test",
    primeiro_acesso: 1,
  });

  const response = await passwordRecoveryService.requestRecovery({
    cpf: "52998224725",
    session,
  });

  assert.equal(session.passwordRecovery, undefined);
  assert.equal(
    response.message,
    "Se houver uma conta ativa com este CPF, enviaremos um código para o e-mail cadastrado."
  );
});

test("recuperacao iniciada antes de primeiro acesso nao altera a senha", async () => {
  const session = {
    passwordRecovery: {
      employeeId: 42,
      expiresAt: Date.now() + 60_000,
      verified: true,
    },
  };
  let updateCalled = false;
  employeeModel.updatePasswordForRecovery = async () => {
    updateCalled = true;
    return { affectedRows: 0 };
  };

  await assert.rejects(
    () =>
      passwordRecoveryService.resetPassword({
        novaSenha: "NovaSenha@123",
        session,
      }),
    { name: "UnauthorizedError" }
  );
  assert.equal(updateCalled, true);
  assert.equal(session.passwordRecovery, undefined);
});

test("logs nao preservam senha ou qualquer parte do token temporario", () => {
  const token = createFirstAccessToken(42);
  const sanitized = sanitizeForLog({
    senha: "NovaSenha@123",
    token_primeiro_acesso: token,
    authorization: `Bearer ${token}`,
  });

  assert.equal(sanitized.senha, "[REDACTED_TOKEN]");
  assert.equal(sanitized.token_primeiro_acesso, "[REDACTED_TOKEN]");
  assert.equal(sanitized.authorization, "Bearer [REDACTED]");
  assert.equal(JSON.stringify(sanitized).includes(token), false);
  assert.equal(JSON.stringify(sanitized).includes("NovaSenha@123"), false);
});
