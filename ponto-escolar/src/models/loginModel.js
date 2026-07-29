"use strict";

const database = require("../config/database");

// Permite que as queries participem de uma transação (client passado explicitamente)
// ou usem a conexão padrão do módulo, quando chamadas fora de uma transação.
function getClient(client) {
  return client || database;
}

/**
 * Trava o CPF do login junto com a transacao do funcionario.
 */
async function findByCpfForUpdate(client, cpf) {
  return getClient(client).executeOne(
    "SELECT lf.funcionario_id FROM login_funcionario lf INNER JOIN funcionarios f ON f.id = lf.funcionario_id WHERE f.cpf = ? LIMIT 1 FOR UPDATE",
    [cpf]
  );
}

/**
 * Verifica conflito sem acusar o proprio login durante alteracao de CPF.
 */
async function findCpfConflictForUpdate(client, cpf, excludedFuncionarioId) {
  return getClient(client).executeOne(
    "SELECT lf.funcionario_id FROM login_funcionario lf INNER JOIN funcionarios f ON f.id = lf.funcionario_id WHERE f.cpf = ? AND f.id <> ? LIMIT 1 FOR UPDATE",
    [cpf, excludedFuncionarioId]
  );
}

async function findCredentialsByCpf(cpf) {
  return database.executeOne(
    "SELECT lf.id, lf.funcionario_id, f.cpf, lf.senha_hash AS senha, lf.primeiro_acesso, lf.senha_temporaria_expira_em FROM login_funcionario lf INNER JOIN funcionarios f ON f.id = lf.funcionario_id WHERE f.cpf = ? AND (lf.senha_temporaria_expira_em IS NULL OR lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP) LIMIT 1",
    [cpf]
  );
}

async function createLogin(client, { funcionarioId, senhaHash }) {
  return getClient(client).execute(
    "INSERT INTO login_funcionario (funcionario_id, senha_hash) VALUES (?, ?)",
    [funcionarioId, senhaHash]
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

async function updateLastLogin(funcionarioId) {
  return database.execute(
    "UPDATE login_funcionario SET ultimo_login_em = CURRENT_TIMESTAMP WHERE funcionario_id = ?",
    [funcionarioId]
  );
}

module.exports = {
  findByCpfForUpdate,
  findCpfConflictForUpdate,
  findCredentialsByCpf,
  createLogin,
  updateCpf,
  updateSenha,
  updateLastLogin,
};
