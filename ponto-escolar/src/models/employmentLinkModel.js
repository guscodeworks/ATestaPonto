"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

// Cria vínculo na mesma transação; unidade_escolar_id NOT NULL (null rejeitado pelo banco).
async function createVinculo(
  client,
  {
    funcionarioId,
    schoolUnitId = null,
    cargoId,
    entrada,
    saidaAlmoco,
    retornoAlmoco,
    saida,
  }
) {
  return getClient(client).execute(
    "INSERT INTO vinculos_funcionais (funcionario_id, unidade_escolar_id, cargo_id, horario_entrada, horario_saida_almoco, horario_volta_almoco, horario_saida, data_inicio, status) VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)",
    [
      funcionarioId,
      schoolUnitId,
      cargoId,
      entrada,
      saidaAlmoco,
      retornoAlmoco,
      saida,
      "ATIVO",
    ]
  );
}

// Horários formatados + campos básicos; reutilizado pelas leituras.
const VINCULO_SELECT = `
  v.id, v.funcionario_id, v.unidade_escolar_id, v.cargo_id, v.matricula,
  TIME_FORMAT(v.horario_entrada, '%H:%i:%s') AS entrada,
  TIME_FORMAT(v.horario_saida_almoco, '%H:%i:%s') AS saida_almoco,
  TIME_FORMAT(v.horario_volta_almoco, '%H:%i:%s') AS retorno_almoco,
  TIME_FORMAT(v.horario_saida, '%H:%i:%s') AS saida,
  v.data_inicio, v.data_fim, v.status, v.criado_em, v.atualizado_em
`;

// Cargo + unidade + diretoria via JOINs (diretoria LEFT por robustez).
const VINCULO_WITH_DETAILS_SELECT = `
  ${VINCULO_SELECT},
  c.cargo,
  ue.nome AS unidade_escolar_nome, ue.codigo_inep AS unidade_codigo_inep,
  ue.ativa AS unidade_ativa,
  de.id AS diretoria_ensino_id, de.nome AS diretoria_nome, de.codigo AS diretoria_codigo
`;

const VINCULO_WITH_DETAILS_JOINS = `
  FROM vinculos_funcionais v
  INNER JOIN cargos c ON c.id = v.cargo_id
  INNER JOIN unidades_escolares ue ON ue.id = v.unidade_escolar_id
  LEFT JOIN diretorias_ensino de ON de.id = ue.diretoria_ensino_id
`;

async function getById(vinculoId, client) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_SELECT} FROM vinculos_funcionais v WHERE v.id = ? LIMIT 1`,
    [vinculoId]
  );
}

// Trava o vínculo para alteração dentro de uma transação.
async function getByIdForUpdate(client, vinculoId) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_SELECT} FROM vinculos_funcionais v WHERE v.id = ? LIMIT 1 FOR UPDATE`,
    [vinculoId]
  );
}

// Allowlist de campos editáveis (colunas fixas, sem interpolação da requisição).
const VINCULO_UPDATE_ALLOWLIST = Object.freeze({
  matricula: "UPDATE vinculos_funcionais SET matricula = ? WHERE id = ?",
  entrada: "UPDATE vinculos_funcionais SET horario_entrada = ? WHERE id = ?",
  saidaAlmoco: "UPDATE vinculos_funcionais SET horario_saida_almoco = ? WHERE id = ?",
  retornoAlmoco: "UPDATE vinculos_funcionais SET horario_volta_almoco = ? WHERE id = ?",
  saida: "UPDATE vinculos_funcionais SET horario_saida = ? WHERE id = ?",
  dataInicio: "UPDATE vinculos_funcionais SET data_inicio = ? WHERE id = ?",
  dataFim: "UPDATE vinculos_funcionais SET data_fim = ? WHERE id = ?",
  status: "UPDATE vinculos_funcionais SET status = ? WHERE id = ?",
  schoolUnitId: "UPDATE vinculos_funcionais SET unidade_escolar_id = ? WHERE id = ?",
  cargoId: "UPDATE vinculos_funcionais SET cargo_id = ? WHERE id = ?",
});

// Atualiza campos informados (usar dentro de transação, após getByIdForUpdate).
async function update(client, vinculoId, fields = {}) {
  let lastResult = { affectedRows: 0 };
  let totalAffectedRows = 0;

  for (const field of Object.keys(VINCULO_UPDATE_ALLOWLIST)) {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) {
      continue;
    }

    lastResult = await getClient(client).execute(
      VINCULO_UPDATE_ALLOWLIST[field],
      [fields[field], vinculoId]
    );
    totalAffectedRows += Number(lastResult.affectedRows || 0);
  }

  return {
    ...lastResult,
    affectedRows: totalAffectedRows,
  };
}

// Encerra vínculo (status ENCERRADO, data_fim CURRENT_DATE); histórico de pontos intacto.
async function encerrarVinculo(client, vinculoId) {
  return getClient(client).execute(
    "UPDATE vinculos_funcionais SET status = 'ENCERRADO', data_fim = CURRENT_DATE WHERE id = ?",
    [vinculoId]
  );
}

// Vínculos do funcionário, do mais recente ao mais antigo.
async function findByFuncionarioId(funcionarioId, client) {
  return getClient(client).execute(
    `SELECT ${VINCULO_SELECT} FROM vinculos_funcionais v WHERE v.funcionario_id = ? ORDER BY v.id DESC`,
    [funcionarioId]
  );
}

// Vínculo ATIVO mais recente (jornada/cargo/escola para ponto/dashboard).
async function findActiveByFuncionarioId(funcionarioId, client) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_SELECT} FROM vinculos_funcionais v WHERE v.funcionario_id = ? AND v.status = 'ATIVO' ORDER BY v.id DESC LIMIT 1`,
    [funcionarioId]
  );
}

// Trava o vínculo ativo no registro de ponto (evita batidas concorrentes).
async function findActiveByFuncionarioIdForUpdate(client, funcionarioId) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_SELECT} FROM vinculos_funcionais v WHERE v.funcionario_id = ? AND v.status = 'ATIVO' ORDER BY v.id DESC LIMIT 1 FOR UPDATE`,
    [funcionarioId]
  );
}

// Vínculo ativo + cargo + unidade + diretoria (fluxo de ponto/dashboard).
async function findActiveByFuncionarioIdWithDetails(funcionarioId, client) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_WITH_DETAILS_SELECT} ${VINCULO_WITH_DETAILS_JOINS} WHERE v.funcionario_id = ? AND v.status = 'ATIVO' ORDER BY v.id DESC LIMIT 1`,
    [funcionarioId]
  );
}

// Vínculo + detalhes por id (ex.: a partir de vinculo_funcional_id em pontos).
async function findByIdWithDetails(vinculoId, client) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_WITH_DETAILS_SELECT} ${VINCULO_WITH_DETAILS_JOINS} WHERE v.id = ? LIMIT 1`,
    [vinculoId]
  );
}

// Vínculo mais recente (qualquer status) com detalhes; usado na reativação.
async function findLatestByFuncionarioIdWithDetails(funcionarioId, client) {
  return getClient(client).executeOne(
    `SELECT ${VINCULO_WITH_DETAILS_SELECT} ${VINCULO_WITH_DETAILS_JOINS} WHERE v.funcionario_id = ? ORDER BY v.id DESC LIMIT 1`,
    [funcionarioId]
  );
}

module.exports = {
  createVinculo,
  getById,
  getByIdForUpdate,
  update,
  encerrarVinculo,
  findByFuncionarioId,
  findActiveByFuncionarioId,
  findActiveByFuncionarioIdForUpdate,
  findActiveByFuncionarioIdWithDetails,
  findByIdWithDetails,
  findLatestByFuncionarioIdWithDetails,
};
