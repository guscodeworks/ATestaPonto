"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

async function listCargos() {
  return database.execute(
    "SELECT id, cargo, ativo FROM cargos ORDER BY cargo ASC",
    []
  );
}

// cargo é UNIQUE; ignora horários na assinatura.
async function createCargo(client, { cargo } = {}) {
  return getClient(client).execute(
    "INSERT INTO cargos (cargo) VALUES (?)",
    [cargo]
  );
}

// Find-or-create por nome com FOR UPDATE (evita corrida na UNIQUE).
async function findByNomeForUpdate(client, cargo) {
  return getClient(client).executeOne(
    "SELECT id, cargo, ativo FROM cargos WHERE cargo = ? LIMIT 1 FOR UPDATE",
    [cargo]
  );
}

module.exports = {
  listCargos,
  createCargo,
  findByNomeForUpdate,
};
