"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

async function withTransaction(callback) {
  return database.withTransaction(callback);
}

// 1 linha/batida por vínculo+dia; chave = vinculo_funcional_id (não funcionario_id).

async function findByEmployeeAndDate(vinculoFuncionalId, date) {
  return database.execute(
    "SELECT id, vinculo_funcional_id, data_referencia, tipo, registrado_em, created_at, updated_at FROM registro_de_pontos WHERE vinculo_funcional_id = ? AND data_referencia = ? ORDER BY tipo ASC LIMIT 4",
    [vinculoFuncionalId, date]
  );
}

// WHERE por data_referencia (sem função) preserva o índice do intervalo.
async function listByEmployeeAndDateRange(vinculoFuncionalId, startDate, endDate) {
  return database.execute(
    "SELECT id, vinculo_funcional_id, data_referencia, tipo, registrado_em, created_at, updated_at FROM registro_de_pontos WHERE vinculo_funcional_id = ? AND data_referencia >= ? AND data_referencia <= ? ORDER BY data_referencia ASC, tipo ASC",
    [vinculoFuncionalId, startDate, endDate]
  );
}

// Trava as batidas do dia do vínculo para decidir a próxima sem corrida.
async function findByEmployeeAndDateForUpdate(client, vinculoFuncionalId, date) {
  return getClient(client).execute(
    "SELECT id, vinculo_funcional_id, data_referencia, tipo, registrado_em, created_at, updated_at FROM registro_de_pontos WHERE vinculo_funcional_id = ? AND data_referencia = ? ORDER BY tipo ASC FOR UPDATE",
    [vinculoFuncionalId, date]
  );
}

// Snapshot diário do relatório: batidas do dia de todos os vínculos.
async function listRowsByDate(date) {
  return database.execute(
    "SELECT id, vinculo_funcional_id, data_referencia, tipo, registrado_em, created_at, updated_at FROM registro_de_pontos WHERE data_referencia = ? ORDER BY vinculo_funcional_id ASC, tipo ASC",
    [date]
  );
}

// Primeira batida do dia (ENTRADA); batida faltante = sem linha.
async function createFirstPunch(
  client,
  { vinculoFuncionalId, date, time, emptyTime }
) {
  void emptyTime; // sentinel removido; ausência = sem linha.
  const registradoEm = `${date} ${time}`;
  return getClient(client).execute(
    "INSERT INTO registro_de_pontos (vinculo_funcional_id, data_referencia, tipo, registrado_em) VALUES (?, ?, 'ENTRADA', ?)",
    [vinculoFuncionalId, date, registradoEm]
  );
}

// INSERT ... ON DUPLICATE KEY UPDATE por tipo; sentinela/vazio = ignorado.
async function replacePunchRow(
  client,
  { vinculoFuncionalId, date, times }
) {
  const EMPTY_PUNCH_TIME = "00:00:00";
  const batidas = [
    { tipo: "ENTRADA", time: times?.entrada },
    { tipo: "SAIDA_ALMOCO", time: times?.saidaAlmoco },
    { tipo: "RETORNO_ALMOCO", time: times?.voltaAlmoco ?? times?.retornoAlmoco },
    { tipo: "SAIDA", time: times?.saida },
  ];

  let lastResult = { affectedRows: 0 };
  let totalAffectedRows = 0;

  for (const { tipo, time } of batidas) {
    const normalized = String(time || "").trim();
    if (!normalized || normalized === EMPTY_PUNCH_TIME) {
      continue;
    }

    const registradoEm = `${date} ${normalized}`;
    lastResult = await getClient(client).execute(
      "INSERT INTO registro_de_pontos (vinculo_funcional_id, data_referencia, tipo, registrado_em) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE registrado_em = VALUES(registrado_em)",
      [vinculoFuncionalId, date, tipo, registradoEm]
    );
    totalAffectedRows += Number(lastResult.affectedRows || 0);
  }

  return {
    ...lastResult,
    affectedRows: totalAffectedRows,
  };
}

module.exports = {
  withTransaction,
  findByEmployeeAndDate,
  listByEmployeeAndDateRange,
  findByEmployeeAndDateForUpdate,
  listRowsByDate,
  createFirstPunch,
  replacePunchRow,
};
