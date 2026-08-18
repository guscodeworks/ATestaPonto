"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const env = require("../src/config/env");
const punchService = require("../src/services/punchService");
const { authenticateFuncionario } = require("../src/middlewares/authMiddleware");
const employeeModel = require("../src/models/employeeModel");
const loginModel = require("../src/models/loginModel");
const vinculoModel = require("../src/models/vinculoModel");

test("primeiro acesso exige troca e a nova senha libera somente o login posterior", async () => {
  const temporaryPassword = "Temporaria#2026";
  const newPassword = "NovaSenha#2026";
  const state = {
    senhaHash: await bcrypt.hash(temporaryPassword, env.BCRYPT_SALT_ROUNDS),
    primeiroAcesso: true,
  };
  const original = {
    findForPunchLoginByEmail: employeeModel.findForPunchLoginByEmail,
    withTransaction: employeeModel.withTransaction,
    findFirstAccessByFuncionarioIdForUpdate:
      loginModel.findFirstAccessByFuncionarioIdForUpdate,
    updateSenha: loginModel.updateSenha,
    updateLastLogin: loginModel.updateLastLogin,
    findActiveByFuncionarioId: vinculoModel.findActiveByFuncionarioId,
  };

  function employeeForLogin() {
    return {
      id: 77,
      cpf: "52998224725",
      nome: "Funcionario de Teste",
      email: "funcionario@example.test",
      ativo: 1,
      senha_hash: state.senhaHash,
      primeiro_acesso: state.primeiroAcesso,
    };
  }

  employeeModel.findForPunchLoginByEmail = async () => employeeForLogin();
  employeeModel.withTransaction = async (callback) => callback({});
  loginModel.findFirstAccessByFuncionarioIdForUpdate = async () => ({
    funcionario_id: 77,
    senha_hash: state.senhaHash,
    primeiro_acesso: state.primeiroAcesso,
    ativo: 1,
  });
  loginModel.updateSenha = async (_tx, funcionarioId, senhaHash) => {
    assert.equal(funcionarioId, 77);
    state.senhaHash = senhaHash;
    state.primeiroAcesso = false;
    return { affectedRows: 1 };
  };
  loginModel.updateLastLogin = async () => ({ affectedRows: 1 });
  vinculoModel.findActiveByFuncionarioId = async () => ({ id: 99 });

  try {
    const initialLogin = await punchService.loginFuncionario({
      identificador: "funcionario@example.test",
      senha: temporaryPassword,
    });
    assert.equal(initialLogin.troca_senha_obrigatoria, true);
    assert.equal(initialLogin.token, undefined);
    assert.ok(initialLogin.token_troca_senha);
    assert.equal(
      jwt.verify(initialLogin.token_troca_senha, env.JWT_SECRET).purpose,
      "troca_senha_primeiro_acesso"
    );
    const accessError = await new Promise((resolve) => {
      authenticateFuncionario(
        { headers: { authorization: `Bearer ${initialLogin.token_troca_senha}` } },
        {},
        resolve
      );
    });
    assert.equal(accessError.code, "FORBIDDEN");

    const changed = await punchService.changeFirstAccessPassword(77, newPassword);
    assert.deepEqual(changed, {
      senha_alterada: true,
      primeiro_acesso: false,
    });
    assert.equal(await bcrypt.compare(newPassword, state.senhaHash), true);
    assert.equal(await bcrypt.compare(temporaryPassword, state.senhaHash), false);

    const regularLogin = await punchService.loginFuncionario({
      identificador: "funcionario@example.test",
      senha: newPassword,
    });
    assert.equal(regularLogin.primeiro_acesso, false);
    assert.ok(regularLogin.token);
    assert.equal(
      jwt.verify(regularLogin.token, env.JWT_SECRET).purpose,
      undefined
    );
    await assert.rejects(
      () =>
        punchService.loginFuncionario({
          identificador: "funcionario@example.test",
          senha: temporaryPassword,
        }),
      { code: "UNAUTHORIZED" }
    );
  } finally {
    employeeModel.findForPunchLoginByEmail = original.findForPunchLoginByEmail;
    employeeModel.withTransaction = original.withTransaction;
    loginModel.findFirstAccessByFuncionarioIdForUpdate =
      original.findFirstAccessByFuncionarioIdForUpdate;
    loginModel.updateSenha = original.updateSenha;
    loginModel.updateLastLogin = original.updateLastLogin;
    vinculoModel.findActiveByFuncionarioId = original.findActiveByFuncionarioId;
  }
});
