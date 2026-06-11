"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

async function findByIdForUpdate(client, cargoId) {
  return getClient(client).executeOne(
    "SELECT id FROM cargo WHERE id = ? LIMIT 1 FOR UPDATE",
    [cargoId]
  );
}

async function findDefaultForUpdate(client) {
  return getClient(client).executeOne(
    "SELECT id FROM cargo ORDER BY id ASC LIMIT 1 FOR UPDATE"
  );
}

async function createDefault(client) {
  return getClient(client).execute(
    `INSERT INTO cargo (nome, hora_entrada, hora_saida)
     VALUES (?, ?, ?)`,
    ["Cargo Padrao", "2000-01-01 08:00:00", "2000-01-01 17:00:00"]
  );
}

module.exports = {
  findByIdForUpdate,
  findDefaultForUpdate,
  createDefault,
};
