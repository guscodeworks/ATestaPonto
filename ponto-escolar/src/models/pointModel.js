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

// NOVO SCHEMA: `registro_de_pontos` é UMA LINHA POR BATIDA (coluna `tipo` enum,
// não mais 4 colunas de horário numa mesma linha por dia). A chave de negócio
// passou a ser `vinculo_funcional_id` (NÃO `funcionario_id`), com a restrição
// UNIQUE(vinculo_funcional_id, data_referencia, tipo) que garante no máximo uma
// batida de cada tipo por vínculo/dia.
//
// Os nomes dos métodos públicos foram preservados, mas seus parâmetros passam a
// ser interpretados como `vinculoFuncionalId` (era `funcionarioId`) e os retornos
// passam a espelhar o schema novo (lista de batidas, e não uma linha-agregada).
// Callers que ainda passem/leiam o shape antigo ficam incompatíveis (a cargo da
// migração do Service, fora deste Model).

// Ordem natural das batidas conforme declarado no enum da coluna `tipo`:
// ENTRADA(1) < SAIDA_ALMOCO(2) < RETORNO_ALMOCO(3) < SAIDA(4), já satisfaz
// ORDER BY tipo ASC.
async function findByEmployeeAndDate(vinculoFuncionalId, date) {
  return database.execute(
    "SELECT id, vinculo_funcional_id, data_referencia, tipo, registrado_em, created_at, updated_at FROM registro_de_pontos WHERE vinculo_funcional_id = ? AND data_referencia = ? ORDER BY tipo ASC LIMIT 4",
    [vinculoFuncionalId, date]
  );
}

/**
 * Lista somente as batidas do vinculo no intervalo solicitado. A coluna
 * data_referencia permanece sem funções no WHERE para permitir uso de indice.
 */
async function listByEmployeeAndDateRange(vinculoFuncionalId, startDate, endDate) {
  return database.execute(
    "SELECT id, vinculo_funcional_id, data_referencia, tipo, registrado_em, created_at, updated_at FROM registro_de_pontos WHERE vinculo_funcional_id = ? AND data_referencia >= ? AND data_referencia <= ? ORDER BY data_referencia ASC, tipo ASC",
    [vinculoFuncionalId, startDate, endDate]
  );
}

/**
 * Trava as batidas do dia do vinculo para decidir a proxima batida sem corrida
 * entre requisicoes. (Antes travava uma única linha/dia; agora trava as linhas
 * individuais já registradas para este vinculo+data.)
 */
async function findByEmployeeAndDateForUpdate(client, vinculoFuncionalId, date) {
  return getClient(client).execute(
    "SELECT id, vinculo_funcional_id, data_referencia, tipo, registrado_em, created_at, updated_at FROM registro_de_pontos WHERE vinculo_funcional_id = ? AND data_referencia = ? ORDER BY tipo ASC FOR UPDATE",
    [vinculoFuncionalId, date]
  );
}

/**
 * Lista as batidas do dia (todos os vinculos), ordenadas por vinculo e tipo,
 * para consolidar o snapshot diário do relatório.
 */
async function listRowsByDate(date) {
  return database.execute(
    "SELECT id, vinculo_funcional_id, data_referencia, tipo, registrado_em, created_at, updated_at FROM registro_de_pontos WHERE data_referencia = ? ORDER BY vinculo_funcional_id ASC, tipo ASC",
    [date]
  );
}

// Cria a primeira batida do dia (ENTRADA). Demantes batidas são persistidas por
// replacePunchRow (cada uma como sua própria linha de `tipo`). `emptyTime` é
// recebido por compatibilidade de assinatura e ignorado: no novo schema, a
// ausência de uma batida é representada pela inexistência da linha (não há mais
// valor sentinela '00:00:00').
async function createFirstPunch(
  client,
  { vinculoFuncionalId, date, time, emptyTime }
) {
  void emptyTime; // sentinel removed; missing punch = no row.
  const registradoEm = `${date} ${time}`;
  return getClient(client).execute(
    "INSERT INTO registro_de_pontos (vinculo_funcional_id, data_referencia, tipo, registrado_em) VALUES (?, ?, 'ENTRADA', ?)",
    [vinculoFuncionalId, date, registradoEm]
  );
}

/**
 * Persiste as batidas presentes em `times` para o vinculo+dado. No novo schema,
 * cada batida é uma linha própria; usamos INSERT ... ON DUPLICATE KEY UPDATE
 * (a UNIQUE(vinculo_funcional_id, data_referencia, tipo) resolve a idempotência).
 * Batidas ausentes ('00:00:00' sentinela ou vazio) são ignoradas — não há
 * linha para criar/atualizar.
 */
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
