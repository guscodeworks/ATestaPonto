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
    "SELECT id FROM login WHERE cpf = ? LIMIT 1 FOR UPDATE",
    [cpf]
  );
}

/**
 * Verifica conflito sem acusar o proprio login durante alteracao de CPF.
 */
async function findCpfConflictForUpdate(client, cpf, excludedLoginId) {
  return getClient(client).executeOne(
    "SELECT id FROM login WHERE cpf = ? AND id <> ? LIMIT 1 FOR UPDATE",
    [cpf, excludedLoginId]
  );
}

async function findCredentialsByCpf(cpf) {
  return database.executeOne(
    "SELECT id, cpf, senha FROM login WHERE cpf = ? LIMIT 1",
    [cpf]
  );
}

async function createLogin(client, { cpf, senhaHash }) {
  return getClient(client).execute(
    "INSERT INTO login (cpf, senha) VALUES (?, ?)",
    [cpf, senhaHash]
  );
}

async function updateCpf(client, loginId, cpf) {
  return getClient(client).execute("UPDATE login SET cpf = ? WHERE id = ?", [
    cpf,
    loginId,
  ]);
}

async function updateSenha(client, loginId, senhaHash) {
  return getClient(client).execute("UPDATE login SET senha = ? WHERE id = ?", [
    senhaHash,
    loginId,
  ]);
}

module.exports = {
  findByCpfForUpdate,
  findCpfConflictForUpdate,
  findCredentialsByCpf,
  createLogin,
  updateCpf,
  updateSenha,
};