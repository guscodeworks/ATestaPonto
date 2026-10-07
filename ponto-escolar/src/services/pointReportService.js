"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError, BadRequestError, ForbiddenError } = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");

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

// O escopo vem exclusivamente do middleware, nunca da query/body do navegador.
function reportScope(escopoUnidades) {
  const global = escopoUnidades === null;
  if (!global && (!Array.isArray(escopoUnidades)
    || escopoUnidades.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0))) {
    throw new ForbiddenError("Escopo administrativo invalido");
  }
  return {
    escopo_global: global,
    unidades_escolares_ids: global ? [] : [...new Set(escopoUnidades.map(Number))],
  };
}

async function requestReport(path, body) {
  try {
    const response = await requestSpring(path, { method: "POST", body });
    if (response.status === 400) {
      throw new BadRequestError("Data ou escopo de relatorio invalido");
    }
    if (response.status === 403) throw new ForbiddenError("Recurso fora do escopo autorizado");
    if (!response.ok) throw new Error("Resposta interna invalida");
    const result = await response.json();
    const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
    if (!isObject(result) || !isObject(result.resumo)) {
      throw new Error("Resposta interna invalida");
    }
    if (path === "/internal/relatorios/diario"
        && (typeof result.date !== "string" || !Array.isArray(result.presentes)
          || !Array.isArray(result.ausentes) || !Array.isArray(result.relatorio))) {
      throw new Error("Resposta interna invalida");
    }
    if (path === "/internal/relatorios/hierarquia"
        && (typeof result.data_referencia !== "string" || !Array.isArray(result.diretorias))) {
      throw new Error("Resposta interna invalida");
    }
    return result;
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof ForbiddenError) throw error;
    throw new AppError("Servico de relatorios indisponivel", {
      statusCode: 502,
      code: "REPORT_SERVICE_UNAVAILABLE",
    });
  }
}

function buildDailySnapshot(date, escopoUnidades = []) {
  return requestReport("/internal/relatorios/diario", { data: date, ...reportScope(escopoUnidades) });
}

async function getWeeklyReport({ data } = {}, escopoUnidades = []) {
  if (data !== undefined && (typeof data !== "string" || !data.trim())) {
    throw new BadRequestError("Data invalida. Use o formato YYYY-MM-DD");
  }
  const date = resolveReportDate(data);
  const isDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number(value.slice(0, 4)) >= 1000
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  if (!isDate(date)) throw new BadRequestError("Data invalida. Use o formato YYYY-MM-DD");
  const monday = new Date(`${date}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const dates = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
  if (!dates.every(isDate)) throw new BadRequestError("Semana fora do intervalo suportado");
  const result = await requestReport("/internal/relatorios/semanal", {
    data: date, ...reportScope(escopoUnidades),
  });
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const isCount = value => Number.isSafeInteger(value) && value >= 0;
  const isDay = (day, index) => isObject(day) && isDate(day.data) && day.data === dates[index]
    && typeof day.futuro === "boolean"
    && day.futuro === (day.data > result.data_atual) && isObject(day.resumo)
    && ["total_funcionarios", "total_ativos", "presentes", "ausentes", "taxa_presenca_percent"]
      .every(field => isCount(day.resumo[field]))
    && day.resumo.total_ativos === day.resumo.total_funcionarios
    && day.resumo.presentes <= day.resumo.total_funcionarios
    && day.resumo.ausentes === day.resumo.total_funcionarios - day.resumo.presentes
    && day.resumo.taxa_presenca_percent <= 100
    && day.resumo.taxa_presenca_percent === (day.resumo.total_funcionarios === 0 ? 0
      : Math.round(100 * day.resumo.presentes / day.resumo.total_funcionarios))
    && (!day.futuro || day.resumo.total_funcionarios === 0);
  const summary = result.resumo;
  if (!isObject(result) || !isDate(result.data_referencia) || result.data_referencia !== date
      || !isDate(result.data_inicio) || result.data_inicio !== dates[0]
      || !isDate(result.data_fim) || result.data_fim !== dates[6] || !isDate(result.data_atual)
      || !isObject(summary)
      || !Array.isArray(result.dias) || result.dias.length !== 7 || !result.dias.every(isDay)
      || !["total_previstos", "total_presencas", "total_ausencias", "taxa_presenca_percent"]
        .every(field => isCount(summary[field]))
      || summary.total_presencas > summary.total_previstos
      || summary.taxa_presenca_percent > 100
      || summary.total_previstos !== result.dias.reduce((sum, day) => sum + day.resumo.total_funcionarios, 0)
      || summary.total_presencas !== result.dias.reduce((sum, day) => sum + day.resumo.presentes, 0)
      || summary.total_ausencias !== summary.total_previstos - summary.total_presencas
      || summary.taxa_presenca_percent !== (summary.total_previstos === 0 ? 0
        : Math.round(100 * summary.total_presencas / summary.total_previstos))) {
    throw new AppError("Servico de relatorios indisponivel", {
      statusCode: 502,
      code: "REPORT_SERVICE_UNAVAILABLE",
    });
  }
  return {
    data_referencia: result.data_referencia,
    data_inicio: result.data_inicio,
    data_fim: result.data_fim,
    data_atual: result.data_atual,
    resumo: {
      total_previstos: summary.total_previstos,
      total_presencas: summary.total_presencas,
      total_ausencias: summary.total_ausencias,
      taxa_presenca_percent: summary.taxa_presenca_percent,
    },
    dias: result.dias.map(day => ({
      data: day.data,
      futuro: day.futuro,
      resumo: {
        total_funcionarios: day.resumo.total_funcionarios,
        total_ativos: day.resumo.total_ativos,
        presentes: day.resumo.presentes,
        ausentes: day.resumo.ausentes,
        taxa_presenca_percent: day.resumo.taxa_presenca_percent,
      },
    })),
  };
}

function filterId(value) {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)
      || !Number.isSafeInteger(Number(value))) {
    throw new BadRequestError("Filtro de relatorio invalido");
  }
  return Number(value);
}

async function getHierarchicalReport({ data, diretoria_ensino_id, unidade_escolar_id,
  adminId, ipOrigem } = {}, escopoUnidades = [], escopo) {
  const date = resolveReportDate(data);
  const scope = reportScope(escopoUnidades);
  if (!escopo || !escopo.temAcesso || scope.escopo_global !== Boolean(escopo.isSeduc)) {
    throw new ForbiddenError("Escopo administrativo invalido");
  }
  const schoolId = filterId(unidade_escolar_id);
  const departmentId = filterId(diretoria_ensino_id);
  if (schoolId !== null && !scope.escopo_global && !scope.unidades_escolares_ids.includes(schoolId)) {
    throw new ForbiddenError("Recurso fora do escopo autorizado");
  }
  const result = await requestReport("/internal/relatorios/hierarquia", {
    data: date,
    ...scope,
    diretorias_ensino_ids: scope.escopo_global ? [] : [...escopo.diretoriasPermitidas],
    diretoria_ensino_id: departmentId,
    unidade_escolar_id: schoolId,
  });
  const summaryFields = [
    "total_funcionarios", "total_ativos", "presentes", "ausentes", "taxa_presenca_percent",
    "total_vinculos", "total_escolas", "total_diretorias",
  ];
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const isId = value => Number.isSafeInteger(value) && value > 0;
  const isSummary = value => isObject(value)
    && summaryFields.every(field => Number.isSafeInteger(value[field]) && value[field] >= 0)
    && value.taxa_presenca_percent <= 100;
  const isSchool = school => isObject(school) && isId(school.unidade_escolar_id)
    && typeof school.unidade_escolar_nome === "string" && isSummary(school.resumo)
    && (schoolId === null || school.unidade_escolar_id === schoolId)
    && (scope.escopo_global || scope.unidades_escolares_ids.includes(school.unidade_escolar_id));
  const isDepartment = department => isObject(department) && isId(department.diretoria_ensino_id)
    && typeof department.diretoria_ensino_nome === "string" && isSummary(department.resumo)
    && (departmentId === null || department.diretoria_ensino_id === departmentId)
    && Array.isArray(department.escolas) && department.escolas.every(isSchool)
    && (scope.escopo_global || escopo.diretoriasPermitidas.has(department.diretoria_ensino_id)
      || department.escolas.length > 0);
  if (!isObject(result) || result.data_referencia !== date || !isSummary(result.resumo)
      || !Array.isArray(result.diretorias) || !result.diretorias.every(isDepartment)) {
    throw new AppError("Servico de relatorios indisponivel", {
      statusCode: 502,
      code: "REPORT_SERVICE_UNAVAILABLE",
    });
  }
  await registerAuditLog({
    evento: "relatorio_consultado", adminId, ipOrigem,
    mensagem: "Administrador consultou relatorio hierarquico de ponto",
    metadados: { data_referencia: date, diretoria_ensino_id: departmentId, unidade_escolar_id: schoolId },
  });
  return result;
}

async function getTodayPoints({ data } = {}, escopoUnidades = []) {
  const date = resolveReportDate(data);
  const snapshot = await buildDailySnapshot(date, escopoUnidades);
  const summaryFields = [
    "total_funcionarios", "total_ativos", "presentes", "ausentes", "taxa_presenca_percent",
  ];
  if (!snapshot || snapshot.date !== date || !snapshot.resumo
      || summaryFields.some(field => !Number.isSafeInteger(snapshot.resumo[field])
        || snapshot.resumo[field] < 0)
      || snapshot.resumo.taxa_presenca_percent > 100
      || !Array.isArray(snapshot.presentes) || !Array.isArray(snapshot.ausentes)) {
    throw new AppError("Servico de relatorios indisponivel", {
      statusCode: 502,
      code: "REPORT_SERVICE_UNAVAILABLE",
    });
  }

  return {
    data_referencia: date,
    resumo: Object.fromEntries(summaryFields.map(field => [field, snapshot.resumo[field]])),
    presentes: snapshot.presentes,
    ausentes: snapshot.ausentes,
  };
}

async function getDailyReport({ data, adminId, ipOrigem } = {}, escopoUnidades = []) {
  const date = resolveReportDate(data);
  const snapshot = await buildDailySnapshot(date, escopoUnidades);
  const summaryFields = [
    "total_funcionarios", "total_ativos", "presentes", "ausentes", "taxa_presenca_percent",
  ];
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const isId = value => Number.isSafeInteger(value) && value > 0;
  const isTime = value => typeof value === "string"
    ? value.startsWith(`${date} `) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    : isObject(value) && Object.keys(value).length === 0;
  const isItem = item => isObject(item)
    && typeof item.id === "string" && isId(item.vinculo_funcional_id)
    && isId(item.unidade_escolar_id) && typeof item.unidade_escolar_nome === "string"
    && isObject(item.funcionario) && isId(item.funcionario.id)
    && typeof item.funcionario.nome === "string"
    && (item.funcionario.email === null || typeof item.funcionario.email === "string")
    && typeof item.funcionario.cpf === "string" && typeof item.funcionario.ativo === "boolean"
    && (item.funcionario.cargo_id === null || isId(item.funcionario.cargo_id))
    && ["AUSENTE", "EM_ANDAMENTO", "COMPLETO"].includes(item.status)
    && Number.isSafeInteger(item.total_batidas) && item.total_batidas >= 0
    && isTime(item.entrada) && isTime(item.saida) && Array.isArray(item.registros)
    && item.registros.every(punch => isObject(punch) && isId(punch.id)
      && ["ENTRADA", "SAIDA_ALMOCO", "RETORNO_ALMOCO", "SAIDA"].includes(punch.tipo)
      && Number.isInteger(punch.sequencia) && punch.sequencia >= 1 && punch.sequencia <= 4
      && typeof punch.registrado_em === "string" && isTime(punch.registrado_em));
  if (!snapshot || snapshot.date !== date || !isObject(snapshot.resumo)
      || summaryFields.some(field => !Number.isSafeInteger(snapshot.resumo[field])
        || snapshot.resumo[field] < 0)
      || snapshot.resumo.taxa_presenca_percent > 100
      || !Array.isArray(snapshot.relatorio) || !snapshot.relatorio.every(isItem)) {
    throw new AppError("Servico de relatorios indisponivel", {
      statusCode: 502,
      code: "REPORT_SERVICE_UNAVAILABLE",
    });
  }

  await registerAuditLog({
    evento: "relatorio_consultado",
    adminId,
    mensagem: "Administrador consultou relatorio de ponto",
    ipOrigem,
    metadados: { data_referencia: date },
  });

  return {
    data_referencia: date,
    resumo: Object.fromEntries(summaryFields.map(field => [field, snapshot.resumo[field]])),
    items: snapshot.relatorio,
  };
}

async function getDashboardSummary(escopoUnidades = []) {
  const date = getTodayDateInSaoPaulo();
  const snapshot = await buildDailySnapshot(date, escopoUnidades);
  const summaryFields = [
    "total_funcionarios", "total_ativos", "presentes", "ausentes", "taxa_presenca_percent",
  ];
  if (!snapshot || snapshot.date !== date || !snapshot.resumo
      || summaryFields.some(field => !Number.isSafeInteger(snapshot.resumo[field])
        || snapshot.resumo[field] < 0)
      || snapshot.resumo.taxa_presenca_percent > 100) {
    throw new AppError("Servico de relatorios indisponivel", {
      statusCode: 502,
      code: "REPORT_SERVICE_UNAVAILABLE",
    });
  }

  return {
    data_referencia: date,
    resumo: Object.fromEntries(summaryFields.map(field => [field, snapshot.resumo[field]])),
  };
}

module.exports = {
  getTodayDateInSaoPaulo,
  resolveReportDate,
  buildDailySnapshot,
  getTodayPoints,
  getDailyReport,
  getWeeklyReport,
  getDashboardSummary,
  getHierarchicalReport,
};
