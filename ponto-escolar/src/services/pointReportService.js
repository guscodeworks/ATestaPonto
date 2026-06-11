'use strict';

const employeeModel = require('../models/employeeModel');
const pointModel = require('../models/pointModel');
const { maskCpf } = require('../utils/cpf');
const {
  EMPTY_PUNCH_TIME,
  PUNCH_TYPES,
  hasPunchTime,
  normalizeTimeValue,
  readPunchTimesFromRow
} = require('../utils/punch');
const { BadRequestError } = require('../utils/errors');
const { registerAuditLog } = require('./auditLogService');

const PUNCH_STEPS = [
  { key: 'entrada', tipo: PUNCH_TYPES[0], sequencia: 1 },
  { key: 'saidaAlmoco', tipo: PUNCH_TYPES[1], sequencia: 2 },
  { key: 'voltaAlmoco', tipo: PUNCH_TYPES[2], sequencia: 3 },
  { key: 'saida', tipo: PUNCH_TYPES[3], sequencia: 4 }
];

function getTodayDateInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function resolveReportDate(value) {
  const date = String(value || getTodayDateInSaoPaulo()).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestError('Data invalida. Use o formato YYYY-MM-DD');
  }

  return date;
}

function toDateTime(date, time) {
  if (!hasPunchTime(time)) {
    return null;
  }

  return `${date} ${normalizeTimeValue(time)}`;
}

function buildPunchList(rowId, date, times) {
  return PUNCH_STEPS
    .filter((step) => hasPunchTime(times[step.key]))
    .map((step) => ({
      id: Number(rowId) * 10 + step.sequencia,
      tipo: step.tipo,
      sequencia: step.sequencia,
      registrado_em: toDateTime(date, times[step.key])
    }));
}

function getEmptyPunchTimes() {
  return {
    entrada: EMPTY_PUNCH_TIME,
    saidaAlmoco: EMPTY_PUNCH_TIME,
    voltaAlmoco: EMPTY_PUNCH_TIME,
    saida: EMPTY_PUNCH_TIME
  };
}

function summarizeEmployeeDay(employee, punchRow, date) {
  const times = punchRow ? readPunchTimesFromRow(punchRow) : getEmptyPunchTimes();
  const registros = punchRow ? buildPunchList(punchRow.id, date, times) : [];
  const totalBatidas = registros.length;
  const status = totalBatidas === 0
    ? 'AUSENTE'
    : hasPunchTime(times.saida)
      ? 'COMPLETO'
      : 'EM_ANDAMENTO';

  return {
    funcionario: {
      id: employee.id,
      nome: employee.nome,
      email: employee.email,
      cpf: maskCpf(employee.cpf),
      ativo: Boolean(employee.ativo),
      cargo_id: employee.cargo_id
    },
    status,
    total_batidas: totalBatidas,
    entrada: toDateTime(date, times.entrada),
    saida: toDateTime(date, times.saida),
    registros
  };
}

function indexLatestPunchRowsByEmployee(punchRows) {
  const byEmployee = new Map();

  punchRows.forEach((row) => {
    const employeeId = Number(row.funcionario_id);

    if (!byEmployee.has(employeeId)) {
      byEmployee.set(employeeId, row);
    }
  });

  return byEmployee;
}

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
      taxa_presenca_percent: totalAtivos > 0
        ? Math.round((totalPresentes / totalAtivos) * 100)
        : 0
    }
  };
}

async function buildDailySnapshot(date) {
  const employees = await employeeModel.listForPointReport();
  const punchRows = await pointModel.listRowsByDate(date);
  const byEmployee = indexLatestPunchRowsByEmployee(punchRows);
  const summaries = employees.map((employee) =>
    summarizeEmployeeDay(employee, byEmployee.get(Number(employee.id)) || null, date)
  );
  const { presentes, ausentes, resumo } = buildSummary(summaries);

  return {
    date,
    total_funcionarios: summaries.length,
    total_funcionarios_ativos: resumo.total_ativos,
    presentes,
    ausentes,
    relatorio: summaries,
    resumo
  };
}

async function getTodayPoints({ data } = {}) {
  const date = resolveReportDate(data);
  const snapshot = await buildDailySnapshot(date);

  return {
    data_referencia: snapshot.date,
    resumo: snapshot.resumo,
    presentes: snapshot.presentes,
    ausentes: snapshot.ausentes
  };
}

async function getDailyReport({ data, adminId, ipOrigem } = {}) {
  const date = resolveReportDate(data);
  const snapshot = await buildDailySnapshot(date);

  await registerAuditLog({
    evento: 'relatorio_consultado',
    adminId,
    mensagem: 'Administrador consultou relatorio de ponto',
    ipOrigem,
    metadados: { data_referencia: date }
  });

  return {
    data_referencia: snapshot.date,
    resumo: snapshot.resumo,
    items: snapshot.relatorio
  };
}

async function getDashboardSummary() {
  const date = getTodayDateInSaoPaulo();
  const snapshot = await buildDailySnapshot(date);

  return {
    data_referencia: snapshot.date,
    resumo: snapshot.resumo
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
  getDashboardSummary
};
