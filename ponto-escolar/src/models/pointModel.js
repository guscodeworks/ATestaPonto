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

// FOR UPDATE bloqueia a linha do dia para evitar que duas batidas de ponto
// simultâneas do mesmo funcionário no mesmo dia gerem condição de corrida.
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

// Regrava a linha do dia inteira (delete + insert) em vez de um UPDATE parcial,
// preservando o mesmo rowId para manter a referência já usada em outras partes
// do sistema (ex: relatórios) enquanto atualiza todos os horários de uma vez.
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