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
    "SELECT id, funcionario_id, data_referencia, entrada, saida_almoco, retorno_almoco, retorno_almoco AS volta_almoco, saida, criado_em, atualizado_em FROM registro_de_pontos WHERE funcionario_id = ? AND data_referencia = ? LIMIT 1",
    [funcionarioId, date]
  );
}

/**
 * Trava o registro do dia para decidir a proxima batida sem corrida entre requisicoes.
 */
async function findByEmployeeAndDateForUpdate(client, funcionarioId, date) {
  return getClient(client).executeOne(
    "SELECT id, funcionario_id, data_referencia, entrada, saida_almoco, retorno_almoco, retorno_almoco AS volta_almoco, saida, criado_em, atualizado_em FROM registro_de_pontos WHERE funcionario_id = ? AND data_referencia = ? LIMIT 1 FOR UPDATE",
    [funcionarioId, date]
  );
}

/**
 * Ordena por funcionario e id recente para o relatorio usar a linha mais nova por pessoa.
 */
async function listRowsByDate(date) {
  return database.execute(
    "SELECT id, funcionario_id, data_referencia, entrada, saida_almoco, retorno_almoco, retorno_almoco AS volta_almoco, saida, criado_em, atualizado_em FROM registro_de_pontos WHERE data_referencia = ? ORDER BY funcionario_id ASC, id DESC",
    [date]
  );
}

// Cria a primeira batida do dia. Os demais horários permanecem NULL até
// serem registrados nas batidas seguintes.
async function createFirstPunch(
  client,
  { funcionarioId, date, time }
) {
  return getClient(client).execute(
    "INSERT INTO registro_de_pontos (funcionario_id, data_referencia, entrada) VALUES (?, ?, ?)",
    [funcionarioId, date, time]
  );
}

/**
 * Mantem o id da linha ao atualizar as quatro batidas do dia.
 */
async function replacePunchRow(client, { rowId, funcionarioId, date, times }) {
  return getClient(client).execute(
    "UPDATE registro_de_pontos SET entrada = ?, saida_almoco = ?, retorno_almoco = ?, saida = ? WHERE id = ? AND funcionario_id = ? AND data_referencia = ?",
    [
      times.entrada,
      times.saidaAlmoco,
      times.retornoAlmoco ?? times.voltaAlmoco,
      times.saida,
      rowId,
      funcionarioId,
      date,
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
