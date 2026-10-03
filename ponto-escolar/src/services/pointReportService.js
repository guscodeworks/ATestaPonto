"use strict";

const employeeModel = require("../models/employeeModel");
const pointModel = require("../models/pointModel");
const employmentLinkModel = require("../models/employmentLinkModel");
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

// Ordem do relatório = mesma sequência usada para registrar as batidas.
const PUNCH_STEPS = [
  { key: "entrada", tipo: PUNCH_TYPES[0], sequencia: 1 },
  { key: "saidaAlmoco", tipo: PUNCH_TYPES[1], sequencia: 2 },
  { key: "voltaAlmoco", tipo: PUNCH_TYPES[2], sequencia: 3 },
  { key: "saida", tipo: PUNCH_TYPES[3], sequencia: 4 },
];

// enum `tipo` → sequência lógica. Banco grava RETORNO_ALMOCO; field lógico é
// voltaAlmoco (bate com o STEP correspondente p/ somar a batida).
const TIPO_TO_SEQUENCIA = {
  ENTRADA: 1,
  SAIDA_ALMOCO: 2,
  RETORNO_ALMOCO: 3,
  SAIDA: 4,
};

// "Hoje" no fuso de São Paulo (independente do fuso do servidor) p/ que o
// relatório do dia bata com o horário local dos funcionários.
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

// Cada batida é uma linha própria (id individual); sequência resolve pelo enum `tipo`.
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

// Status do dia: sem batidas = AUSENTE; com saída = COMPLETO; demais = EM_ANDAMENTO.
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

// listRowsByDate retorna 1 linha por batida (sem coluna funcionario_id, ordenada
// por vínculo/tipo). Agrupando por funcionário, resolvemos cada vínculo ao seu
// funcionário; vínculos repetidos reaproveitam a resolução.
async function resolveVinculoToFuncionario(vinculoIds) {
  const uniqueIds = [...new Set(vinculoIds.map(Number).filter(Number.isInteger))];
  const byVinculo = new Map();
  for (const vinculoId of uniqueIds) {
    const vinculo = await employmentLinkModel.getById(vinculoId);
    if (vinculo) {
      byVinculo.set(vinculoId, Number(vinculo.funcionario_id));
    }
  }
  return byVinculo;
}

// Agrupa batidas do dia por funcionário. Cada vínculo resolve-se em seu
// funcionário; sem batidas não aparecem (completados pelo cruzamento com ativos).
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

// Taxa de presença só sobre ativos (desligados nunca batem ponto e distorceriam).
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

// Visão diária nasce em memória (não altera registros durante a consulta).
async function buildDailySnapshot(date, escopoUnidades = []) {
  const employees = await employeeModel.listForPointReport(escopoUnidades);
  const punchRows = await pointModel.listRowsByDate(date);
  const vinculoToFuncionario = await resolveVinculoToFuncionario(
    punchRows.map((row) => row.vinculo_funcional_id)
  );
  const byEmployee = indexPunchesByEmployee(punchRows, vinculoToFuncionario);
  // Filtra batidas de fora do escopo: snapshot nasce da lista de permitidos.
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

async function getTodayPoints({ data } = {}, escopoUnidades = []) {
  const date = resolveReportDate(data);
  const snapshot = await buildDailySnapshot(date, escopoUnidades);

  return {
    data_referencia: snapshot.date,
    resumo: snapshot.resumo,
    presentes: snapshot.presentes,
    ausentes: snapshot.ausentes,
  };
}

async function getDailyReport({ data, adminId, ipOrigem } = {}, escopoUnidades = []) {
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

async function getDashboardSummary(escopoUnidades = []) {
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
