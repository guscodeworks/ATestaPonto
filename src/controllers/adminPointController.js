const { execute } = require('../config/database');
const { maskCpf } = require('../utils/cpf');
const { BadRequestError } = require('../utils/errors');
const { registerAuditLog } = require('../services/auditLogService');

const PUNCH_TYPE_LABELS = {
  ENTRADA: 'ENTRADA',
  SAIDA_ALMOCO: 'SAIDA_ALMOCO',
  VOLTA_ALMOCO: 'VOLTA_ALMOCO',
  SAIDA: 'SAIDA'
};

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

function mapPunchesByEmployee(punchRows) {
  const byEmployee = new Map();

  punchRows.forEach((row) => {
    const employeeId = Number(row.funcionario_id);
    if (!byEmployee.has(employeeId)) {
      byEmployee.set(employeeId, []);
    }
    byEmployee.get(employeeId).push(row);
  });

  return byEmployee;
}

function summarizeEmployeeDay(employee, punches) {
  const ordered = [...punches].sort((a, b) => Number(a.sequencia) - Number(b.sequencia));
  const firstEntry = ordered.find((p) => p.tipo === PUNCH_TYPE_LABELS.ENTRADA) || null;
  const finalExit = ordered.find((p) => p.tipo === PUNCH_TYPE_LABELS.SAIDA) || null;

  const status = ordered.length === 0 ? 'AUSENTE' : finalExit ? 'COMPLETO' : 'EM_ANDAMENTO';

  return {
    funcionario: {
      id: employee.id,
      nome: employee.nome,
      email: employee.email,
      cpf: maskCpf(employee.cpf),
      ativo: Boolean(employee.ativo)
    },
    status,
    total_batidas: ordered.length,
    entrada: firstEntry?.registrado_em || null,
    saida: finalExit?.registrado_em || null,
    registros: ordered.map((row) => ({
      id: row.id,
      tipo: row.tipo,
      sequencia: row.sequencia,
      registrado_em: row.registrado_em
    }))
  };
}

async function buildDailySnapshot(date) {
  const employees = await execute(
    `SELECT id, nome, email, cpf, ativo
     FROM funcionarios
     ORDER BY nome ASC`
  );

  const punchRows = await execute(
    `SELECT id, funcionario_id, tipo, sequencia, registrado_em
     FROM registro_de_pontos
     WHERE data_referencia = ?
     ORDER BY funcionario_id ASC, sequencia ASC`,
    [date]
  );

  const byEmployee = mapPunchesByEmployee(punchRows);
  const summaries = employees.map((employee) =>
    summarizeEmployeeDay(employee, byEmployee.get(Number(employee.id)) || [])
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
