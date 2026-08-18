"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

// Trava o login do CPF junto com a transação do funcionário.
async function findByCpfForUpdate(client, cpf) {
  return getClient(client).executeOne(
    "SELECT lf.funcionario_id FROM login_funcionario lf INNER JOIN funcionarios f ON f.id = lf.funcionario_id WHERE f.cpf = ? LIMIT 1 FOR UPDATE",
    [cpf]
  );
}

// Conflito de CPF excluindo o próprio login (alteração de CPF).
async function findCpfConflictForUpdate(client, cpf, excludedFuncionarioId) {
  return getClient(client).executeOne(
    "SELECT lf.funcionario_id FROM login_funcionario lf INNER JOIN funcionarios f ON f.id = lf.funcionario_id WHERE f.cpf = ? AND f.id <> ? LIMIT 1 FOR UPDATE",
    [cpf, excludedFuncionarioId]
  );
}

async function createLogin(client, { funcionarioId, senhaHash }) {
  return getClient(client).execute(
    "INSERT INTO login_funcionario (funcionario_id, senha_hash, primeiro_acesso) VALUES (?, ?, ?)",
    [funcionarioId, senhaHash, true]
  );
}

async function updateCpf(client, funcionarioId, cpf) {
  return getClient(client).execute("UPDATE funcionarios SET cpf = ? WHERE id = ?", [
    cpf,
    funcionarioId,
  ]);
}

async function updateSenha(client, funcionarioId, senhaHash) {
  return getClient(client).execute(
    "UPDATE login_funcionario SET senha_hash = ?, senha_alterada_em = CURRENT_TIMESTAMP, senha_temporaria_expira_em = NULL, primeiro_acesso = FALSE WHERE funcionario_id = ?",
    [senhaHash, funcionarioId]
  );
}

// A troca obrigatoria consulta e trava o estado persistido no banco para que
// duas requisicoes concorrentes nao consigam concluir o primeiro acesso.
async function findFirstAccessByFuncionarioIdForUpdate(client, funcionarioId) {
  return getClient(client).executeOne(
    "SELECT lf.funcionario_id, lf.senha_hash, lf.primeiro_acesso, f.ativo FROM login_funcionario lf INNER JOIN funcionarios f ON f.id = lf.funcionario_id WHERE lf.funcionario_id = ? LIMIT 1 FOR UPDATE",
    [funcionarioId]
  );
}

async function updateLastLogin(funcionarioId) {
  return database.execute(
    "UPDATE login_funcionario SET ultimo_login_em = CURRENT_TIMESTAMP WHERE funcionario_id = ?",
    [funcionarioId]
  );
}

module.exports = {
  findByCpfForUpdate,
  findCpfConflictForUpdate,
  createLogin,
  updateCpf,
  updateSenha,
  findFirstAccessByFuncionarioIdForUpdate,
  updateLastLogin,
};
