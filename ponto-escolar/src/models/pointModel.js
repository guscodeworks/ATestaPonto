"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

async function withTransaction(callback) {
  return database.withTransaction(callback);
}

async function findByEmployeeAndDate(funcionarioId, date) {
  return database.executeOne(
    `SELECT *
     FROM registro_de_pontos
     WHERE funcionario_id = ? AND data_referenciada = ?
     LIMIT 1`,
    [funcionarioId, date]
  );
}

async function findByEmployeeAndDateForUpdate(client, funcionarioId, date) {
  return getClient(client).executeOne(
    `SELECT *
     FROM registro_de_pontos
     WHERE funcionario_id = ? AND data_referenciada = ?
     LIMIT 1
     FOR UPDATE`,
    [funcionarioId, date]
  );
}

async function listRowsByDate(date) {
  return database.execute(
    `SELECT *
     FROM registro_de_pontos
     WHERE data_referenciada = ?
     ORDER BY funcionario_id ASC, id DESC`,
    [date]
  );
}

async function createFirstPunch(
  client,
  { funcionarioId, date, time, emptyTime }
) {
  return getClient(client).execute(
    "INSERT INTO registro_de_pontos VALUES (NULL, ?, ?, ?, ?, ?, ?)",
    [funcionarioId, date, time, emptyTime, emptyTime, emptyTime]
  );
}

async function replacePunchRow(client, { rowId, funcionarioId, date, times }) {
  await getClient(client).execute(
    "DELETE FROM registro_de_pontos WHERE id = ?",
    [rowId]
  );

  return getClient(client).execute(
    "INSERT INTO registro_de_pontos VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      rowId,
      funcionarioId,
      date,
      times.entrada,
      times.saidaAlmoco,
      times.voltaAlmoco,
      times.saida,
    ]
  );
}

module.exports = {
  withTransaction,
  findByEmployeeAndDate,
  findByEmployeeAndDateForUpdate,
  listRowsByDate,
  createFirstPunch,
  replacePunchRow,
};
