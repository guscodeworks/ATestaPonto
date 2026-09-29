"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

async function withTransaction(callback) {
  return database.withTransaction(callback);
}

// Consultar depois do lock do funcionário; chave e batida têm o mesmo commit.
async function findIdempotencyForUpdate(client, funcionarioId, chave) {
  return getClient(client).executeOne(
    "SELECT requisicao_hash, resposta FROM ponto_idempotencia WHERE funcionario_id = ? AND chave = ? FOR UPDATE",
    [funcionarioId, chave]
  );
}

async function saveIdempotency(client, funcionarioId, chave, requestHash, response) {
  return getClient(client).execute(
    "INSERT INTO ponto_idempotencia (funcionario_id, chave, requisicao_hash, resposta) VALUES (?, ?, ?, ?)",
    [funcionarioId, chave, requestHash, JSON.stringify(response)]
  );
}

// 1 linha/batida por vínculo+dia; chave = vinculo_funcional_id (não funcionario_id).

async function findByEmployeeAndDate(vinculoFuncionalId, date) {
  return database.execute(
    "SELECT id, vinculo_funcional_id, data_referencia, tipo, registrado_em, created_at, updated_at FROM registro_de_pontos WHERE vinculo_funcional_id = ? AND data_referencia = ? ORDER BY tipo ASC LIMIT 4",
    [vinculoFuncionalId, date]
  );
}

// WHERE por data_referencia (sem função) preserva o índice do intervalo.
async function listByEmployeeAndDateRange(funcionarioId, startDate, endDate) {
  return database.execute(
    `SELECT p.id, p.vinculo_funcional_id, p.data_referencia, p.tipo,
            p.registrado_em, p.created_at, p.updated_at,
            v.unidade_escolar_id, ue.nome AS unidade_escolar_nome
     FROM registro_de_pontos p
     INNER JOIN vinculos_funcionais v ON v.id = p.vinculo_funcional_id
     INNER JOIN unidades_escolares ue ON ue.id = v.unidade_escolar_id
     WHERE v.funcionario_id = ? AND p.data_referencia >= ? AND p.data_referencia <= ?
     ORDER BY p.data_referencia ASC, p.vinculo_funcional_id ASC, p.tipo ASC`,
    [funcionarioId, startDate, endDate]
  );
}

// Trava as batidas do dia do vínculo para decidir a próxima sem corrida.
async function findByEmployeeAndDateForUpdate(client, vinculoFuncionalId, date) {
  return getClient(client).execute(
    "SELECT id, vinculo_funcional_id, data_referencia, tipo, registrado_em, created_at, updated_at FROM registro_de_pontos WHERE vinculo_funcional_id = ? AND data_referencia = ? ORDER BY tipo ASC FOR UPDATE",
    [vinculoFuncionalId, date]
  );
}

// O escopo incide sobre a unidade do vínculo vigente na data consultada.
// LEFT JOIN conserva vínculos vigentes sem batidas para a lista de ausentes.
async function listRowsByDate(date, escopoUnidades = []) {
  let scopeClause = "";
  const params = [date, date, date];
  if (escopoUnidades !== null) {
    if (!Array.isArray(escopoUnidades) || escopoUnidades.length === 0) {
      return [];
    }
    const unitIds = [...new Set(escopoUnidades.map(Number))];
    if (unitIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return [];
    }
    scopeClause = `AND ue.id IN (${unitIds.map(() => "?").join(",")})`;
    params.push(...unitIds);
  }

  return database.execute(
    `SELECT p.id, v.id AS vinculo_funcional_id,
            p.data_referencia, p.tipo, p.registrado_em, p.created_at, p.updated_at,
            f.id AS funcionario_id, f.nome, f.email, f.cpf, f.ativo,
            v.cargo_id, ue.id AS unidade_escolar_id, ue.nome AS unidade_escolar_nome
     FROM vinculos_funcionais v
     INNER JOIN unidades_escolares ue ON ue.id = v.unidade_escolar_id
     INNER JOIN funcionarios f ON f.id = v.funcionario_id
     LEFT JOIN registro_de_pontos p
       ON p.vinculo_funcional_id = v.id AND p.data_referencia = ?
     WHERE (v.data_inicio IS NULL OR v.data_inicio <= ?)
       AND (v.data_fim IS NULL OR v.data_fim >= ?)
       ${scopeClause}
     ORDER BY f.nome ASC, v.id ASC, p.tipo ASC`,
    params
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
  findIdempotencyForUpdate,
  saveIdempotency,
  withTransaction,
  findByEmployeeAndDate,
  listByEmployeeAndDateRange,
  findByEmployeeAndDateForUpdate,
  listRowsByDate,
  createFirstPunch,
  replacePunchRow,
};
