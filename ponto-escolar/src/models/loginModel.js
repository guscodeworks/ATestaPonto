"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

async function findByCpfForUpdate(client, cpf) {
  return getClient(client).executeOne(
    "SELECT id FROM login WHERE cpf = ? LIMIT 1 FOR UPDATE",
    [cpf]
  );
}

async function findCpfConflictForUpdate(client, cpf, excludedLoginId) {
  return getClient(client).executeOne(
    "SELECT id FROM login WHERE cpf = ? AND id <> ? LIMIT 1 FOR UPDATE",
    [cpf, excludedLoginId]
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
  createLogin,
  updateCpf,
  updateSenha,
};
