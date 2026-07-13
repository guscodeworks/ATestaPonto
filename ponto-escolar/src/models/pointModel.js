"use strict";

const database = require("../config/database");

// Permite que as queries participem de uma transação (client passado explicitamente)
// ou usem a conexão padrão do módulo, quando chamadas fora de uma transação.
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

/**
 * Trava o registro do dia para decidir a proxima batida sem corrida entre requisicoes.
 */
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

/**
 * Ordena por funcionario e id recente para o relatorio usar a linha mais nova por pessoa.
 */
async function listRowsByDate(date) {
  return database.execute(
    `SELECT *
     FROM registro_de_pontos
     WHERE data_referenciada = ?
     ORDER BY funcionario_id ASC, id DESC`,
    [date]
  );
}

// Cria a primeira batida do dia (entrada): os demais horários (saída almoço,
// volta almoço, saída) ainda não ocorreram e são preenchidos com o mesmo valor
// "vazio" (emptyTime) até serem registrados nas batidas seguintes.
async function createFirstPunch(
  client,
  { funcionarioId, date, time, emptyTime }
) {
  return getClient(client).execute(
    "INSERT INTO registro_de_pontos VALUES (NULL, ?, ?, ?, ?, ?, ?)",
    [funcionarioId, date, time, emptyTime, emptyTime, emptyTime]
  );
}

/**
 * Mantem o id da linha ao atualizar as quatro batidas do dia.
 */
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