const { execute } = require('../config/database');
const { maskCpf } = require('../utils/cpf');
const { BadRequestError } = require('../utils/errors');
const { registerAuditLog } = require('../services/auditLogService');

const EMPTY_PUNCH_TIME = '00:00:00';
const PUNCH_STEPS = [
  { key: 'entrada', tipo: 'ENTRADA', sequencia: 1 },
  { key: 'saidaAlmoco', tipo: 'SAIDA_ALMOCO', sequencia: 2 },
  { key: 'voltaAlmoco', tipo: 'VOLTA_ALMOCO', sequencia: 3 },
  { key: 'saida', tipo: 'SAIDA', sequencia: 4 }
];

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || null;
}

function getTodayDateInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function parseReportDate(req) {
  const date = String(req.query.data || getTodayDateInSaoPaulo()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestError('Data invalida. Use o formato YYYY-MM-DD');
  }
  return date;
}

function normalizeTimeValue(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return EMPTY_PUNCH_TIME;
  }
  const candidate = raw.slice(0, 8);
  if (/^\d{2}:\d{2}:\d{2}$/.test(candidate)) {
    return candidate;
  }
  return EMPTY_PUNCH_TIME;
}

function hasPunchTime(value) {
  return normalizeTimeValue(value) !== EMPTY_PUNCH_TIME;
}

function findLunchColumnKey(row, prefix) {
  return (
    Object.keys(row || {}).find((key) =>
      String(key || '')
        .toLowerCase()
        .startsWith(prefix)
    ) || null
  );
}

function readPunchTimesFromRow(row) {
  const saidaAlmocoKey = findLunchColumnKey(row, 'saida_almo');
  const voltaAlmocoKey = findLunchColumnKey(row, 'volta_almo');

  return {
    entrada: normalizeTimeValue(row?.entrada),
    saidaAlmoco: normalizeTimeValue(saidaAlmocoKey ? row[saidaAlmocoKey] : null),
    voltaAlmoco: normalizeTimeValue(voltaAlmocoKey ? row[voltaAlmocoKey] : null),
    saida: normalizeTimeValue(row?.saida)
  };
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

function summarizeEmployeeDay(employee, punchRow, date) {
  const times = punchRow
    ? readPunchTimesFromRow(punchRow)
    : { entrada: EMPTY_PUNCH_TIME, saidaAlmoco: EMPTY_PUNCH_TIME, voltaAlmoco: EMPTY_PUNCH_TIME, saida: EMPTY_PUNCH_TIME };

  const registros = punchRow ? buildPunchList(punchRow.id, date, times) : [];
  const totalBatidas = registros.length;
  const status = totalBatidas === 0 ? 'AUSENTE' : hasPunchTime(times.saida) ? 'COMPLETO' : 'EM_ANDAMENTO';

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

async function buildDailySnapshot(date) {
  const employees = await execute(
    `SELECT id, nome, email, cpf, ativo, cargo_id
     FROM funcionarios
     ORDER BY nome ASC`
  );

  const punchRows = await execute(
    `SELECT *
     FROM registro_de_pontos
     WHERE data_referenciada = ?
     ORDER BY funcionario_id ASC, id DESC`,
    [date]
  );

  const byEmployee = new Map();
  punchRows.forEach((row) => {
    const employeeId = Number(row.funcionario_id);
    if (!byEmployee.has(employeeId)) {
      byEmployee.set(employeeId, row);
    }
  });

  const summaries = employees.map((employee) =>
    summarizeEmployeeDay(employee, byEmployee.get(Number(employee.id)) || null, date)
  );

  const activeSummaries = summaries.filter((item) => item.funcionario.ativo);
  const presentes = activeSummaries.filter((item) => item.total_batidas > 0);
  const ausentes = activeSummaries.filter((item) => item.total_batidas === 0);

  const totalAtivos = activeSummaries.length;
  const totalPresentes = presentes.length;
  const taxaPresencaPercent = totalAtivos > 0 ? Math.round((totalPresentes / totalAtivos) * 100) : 0;

  return {
    date,
    total_funcionarios: summaries.length,
    total_funcionarios_ativos: totalAtivos,
    presentes,
    ausentes,
    relatorio: summaries,
    resumo: {
      total_funcionarios: summaries.length,
      total_ativos: totalAtivos,
      presentes: totalPresentes,
      ausentes: ausentes.length,
      taxa_presenca_percent: taxaPresencaPercent
    }
  };
}

async function getTodayPoints(req, res, next) {
  try {
    const date = parseReportDate(req);
    const snapshot = await buildDailySnapshot(date);

    return res.status(200).json({
      success: true,
      data: {
        data_referencia: snapshot.date,
        resumo: snapshot.resumo,
        presentes: snapshot.presentes,
        ausentes: snapshot.ausentes
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function getDailyReport(req, res, next) {
  try {
    const date = parseReportDate(req);
    const snapshot = await buildDailySnapshot(date);

    await registerAuditLog({
      evento: 'relatorio_consultado',
      adminId: req.auth.id,
      mensagem: 'Administrador consultou relatorio de ponto',
      ipOrigem: getClientIp(req),
      metadados: { data_referencia: date }
    });

    return res.status(200).json({
      success: true,
      data: {
        data_referencia: snapshot.date,
        resumo: snapshot.resumo,
        items: snapshot.relatorio
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function getDashboardSummary(req, res, next) {
  try {
    const date = getTodayDateInSaoPaulo();
    const snapshot = await buildDailySnapshot(date);

    return res.status(200).json({
      success: true,
      data: {
        data_referencia: snapshot.date,
        resumo: snapshot.resumo
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getTodayPoints,
  getDailyReport,
  getDashboardSummary
};
