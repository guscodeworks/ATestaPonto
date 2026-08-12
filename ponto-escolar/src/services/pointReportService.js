"use strict";

const employeeModel = require("../models/employeeModel");
const pointModel = require("../models/pointModel");
const vinculoModel = require("../models/vinculoModel");
const { maskCpf } = require("../utils/cpf");
const {
  EMPTY_PUNCH_TIME,
  PUNCH_TYPES,
  hasPunchTime,
  normalizeTimeValue,
  readPunchTimesFromRow,
} = require("../utils/punch");
const { BadRequestError } = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");

// A ordem do relatorio segue a mesma sequencia usada para registrar as batidas.
const PUNCH_STEPS = [
  { key: "entrada", tipo: PUNCH_TYPES[0], sequencia: 1 },
  { key: "saidaAlmoco", tipo: PUNCH_TYPES[1], sequencia: 2 },
  { key: "voltaAlmoco", tipo: PUNCH_TYPES[2], sequencia: 3 },
  { key: "saida", tipo: PUNCH_TYPES[3], sequencia: 4 },
];

// Mapeia o enum `tipo` lido do banco para o field lógico do shape de 4 batidas.
// O banco grava RETORNO_ALMOCO (ver pointModel), mas o field lógico/sequência é
// voltaAlmoco — precisa bater com o STEP correspondente para somar a batida.
const TIPO_TO_SEQUENCIA = {
  ENTRADA: 1,
  SAIDA_ALMOCO: 2,
  RETORNO_ALMOCO: 3,
  SAIDA: 4,
};

// Data "de hoje" calculada no fuso de Sao Paulo, independente do fuso do
// servidor onde a aplicacao roda, para que o relatorio do dia bata com o
// horario local dos funcionarios.
function getTodayDateInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function resolveReportDate(value) {
  const date = String(value || getTodayDateInSaoPaulo()).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestError("Data invalida. Use o formato YYYY-MM-DD");
  }

  return date;
}

function toDateTime(date, time) {
  if (!hasPunchTime(time)) {
    return {};
  }

  return `${date} ${normalizeTimeValue(time)}`;
}

// NOVO SCHEMA: cada batida do dia é uma linha própria em registro_de_pontos
// (id individual por batida), então o id vem direto da linha — não mais um
// id sintético derivado de linha do dia. A sequência resolve pelo enum `tipo`.
function buildPunchList(date, punches) {
  return (Array.isArray(punches) ? punches : [])
    .filter((row) => row && TIPO_TO_SEQUENCIA[row.tipo])
    .map((row) => ({
      id: Number(row.id),
      tipo: row.tipo,
      sequencia: TIPO_TO_SEQUENCIA[row.tipo],
      registrado_em: `${date} ${normalizeTimeValue(row.registrado_em)}`,
    }))
    .sort((a, b) => a.sequencia - b.sequencia);
}

function getEmptyPunchTimes() {
  return {
    entrada: EMPTY_PUNCH_TIME,
    saidaAlmoco: EMPTY_PUNCH_TIME,
    voltaAlmoco: EMPTY_PUNCH_TIME,
    saida: EMPTY_PUNCH_TIME,
  };
}

// Regra de negocio do status do dia: sem nenhuma batida = AUSENTE; com a saida
// registrada = COMPLETO; com pelo menos uma batida mas sem a saida = EM_ANDAMENTO.
function summarizeEmployeeDay(employee, punches, date) {
  const times = punches && punches.length
    ? readPunchTimesFromRow(punches)
    : getEmptyPunchTimes();
  const registros = punches && punches.length
    ? buildPunchList(date, punches)
    : [];
  const totalBatidas = registros.length;
  const status =
    totalBatidas === 0
      ? "AUSENTE"
      : hasPunchTime(times.saida)
      ? "COMPLETO"
      : "EM_ANDAMENTO";

  return {
    funcionario: {
      id: employee.id,
      nome: employee.nome,
      email: employee.email,
      cpf: maskCpf(employee.cpf),
      ativo: Boolean(employee.ativo),
      cargo_id: employee.cargo_id,
    },
    status,
    total_batidas: totalBatidas,
    entrada: toDateTime(date, times.entrada),
    saida: toDateTime(date, times.saida),
    registros,
  };
}

// NOVO SCHEMA: a query de batidas (pointModel.listRowsByDate) retorna 1 linha
// por batida, ordenada por vinculo_funcional_id/tipo — sem coluna funcionario_id.
// Como o relatório agrupa por funcionário, precisamos resolver cada vínculo ao
// seu funcionário. Vínculos repetidos reaproveitam a mesma resolução.
async function resolveVinculoToFuncionario(vinculoIds) {
  const uniqueIds = [...new Set(vinculoIds.map(Number).filter(Number.isInteger))];
  const byVinculo = new Map();
  for (const vinculoId of uniqueIds) {
    const vinculo = await vinculoModel.getById(vinculoId);
    if (vinculo) {
      byVinculo.set(vinculoId, Number(vinculo.funcionario_id));
    }
  }
  return byVinculo;
}

// Agrupa as batidas do dia (1 linha por batida) por funcionário. Cada vínculo
// resolve-se em seu funcionário e agrupa suas batidas; funcionários sem batidas
// não aparecem aqui (são completados pelo cruzamento com a lista de ativos).
function indexPunchesByEmployee(punchRows, vinculoToFuncionario) {
  const byEmployee = new Map();

  for (const row of punchRows) {
    const vinculoId = Number(row.vinculo_funcional_id);
    const funcionarioId = vinculoToFuncionario.get(vinculoId);
    if (!Number.isInteger(funcionarioId)) {
      continue;
    }
    if (!byEmployee.has(funcionarioId)) {
      byEmployee.set(funcionarioId, []);
    }
    byEmployee.get(funcionarioId).push(row);
  }

  return byEmployee;
}

// Taxa de presenca calculada apenas sobre funcionarios ativos, para nao
// distorcer o indicador com funcionarios desligados/inativos que nunca
// vao bater ponto.
function buildSummary(summaries) {
  const activeSummaries = summaries.filter((item) => item.funcionario.ativo);
  const presentes = activeSummaries.filter((item) => item.total_batidas > 0);
  const ausentes = activeSummaries.filter((item) => item.total_batidas === 0);
  const totalAtivos = activeSummaries.length;
  const totalPresentes = presentes.length;

  return {
    presentes,
    ausentes,
    resumo: {
      total_funcionarios: summaries.length,
      total_ativos: totalAtivos,
      presentes: totalPresentes,
      ausentes: ausentes.length,
      taxa_presenca_percent:
        totalAtivos > 0 ? Math.round((totalPresentes / totalAtivos) * 100) : 0,
    },
  };
}

/**
 * A visao diaria nasce em memoria para nao alterar registros durante consultas.
 */
async function buildDailySnapshot(date, escopoUnidades = null) {
  const employees = await employeeModel.listForPointReport(escopoUnidades);
  const punchRows = await pointModel.listRowsByDate(date);
  const vinculoToFuncionario = await resolveVinculoToFuncionario(
    punchRows.map((row) => row.vinculo_funcional_id)
  );
  const byEmployee = indexPunchesByEmployee(punchRows, vinculoToFuncionario);
  // Filtra batidas de funcionarios fora do escopo: o snapshot nasce a partir
  // da lista de funcionarios permitidos, entao so agregamos batidas desses.
  const permittedIds = new Set(employees.map((e) => Number(e.id)));
  const summaries = employees.map((employee) =>
    summarizeEmployeeDay(
      employee,
      permittedIds.has(Number(employee.id))
        ? byEmployee.get(Number(employee.id)) || []
        : [],
      date
    )
  );
  const { presentes, ausentes, resumo } = buildSummary(summaries);

  return {
    date,
    total_funcionarios: summaries.length,
    total_funcionarios_ativos: resumo.total_ativos,
    presentes,
    ausentes,
    relatorio: summaries,
    resumo,
  };
}

async function getTodayPoints({ data } = {}, escopoUnidades = null) {
  const date = resolveReportDate(data);
  const snapshot = await buildDailySnapshot(date, escopoUnidades);

  return {
    data_referencia: snapshot.date,
    resumo: snapshot.resumo,
    presentes: snapshot.presentes,
    ausentes: snapshot.ausentes,
  };
}

async function getDailyReport({ data, adminId, ipOrigem } = {}, escopoUnidades = null) {
  const date = resolveReportDate(data);
  const snapshot = await buildDailySnapshot(date, escopoUnidades);

  await registerAuditLog({
    evento: "relatorio_consultado",
    adminId,
    mensagem: "Administrador consultou relatorio de ponto",
    ipOrigem,
    metadados: { data_referencia: date },
  });

  return {
    data_referencia: snapshot.date,
    resumo: snapshot.resumo,
    items: snapshot.relatorio,
  };
}

async function getDashboardSummary(escopoUnidades = null) {
  const date = getTodayDateInSaoPaulo();
  const snapshot = await buildDailySnapshot(date, escopoUnidades);

  return {
    data_referencia: snapshot.date,
    resumo: snapshot.resumo,
  };
}

module.exports = {
  getTodayDateInSaoPaulo,
  resolveReportDate,
  buildPunchList,
  summarizeEmployeeDay,
  buildDailySnapshot,
  getTodayPoints,
  getDailyReport,
  getDashboardSummary,
};