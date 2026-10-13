"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError, BadRequestError, ForbiddenError, NotFoundError,
  ConflictError, ValidationError } = require("../utils/errors");

function unavailable() {
  return new AppError("Servico de acessos administrativos indisponivel", {
    statusCode: 502, code: "ADMIN_ACCESS_SERVICE_UNAVAILABLE",
  });
}

async function request(operation, body, project) {
  let response;
  let result;
  try {
    response = await requestSpring(`/internal/acessos-administrativos/${operation}`, { method: "POST", body });
    result = await response.json();
  } catch (_error) { throw unavailable(); }
  if (!response.ok) {
    const codes = { BAD_REQUEST: 400, FORBIDDEN: 403, NOT_FOUND: 404,
      CONFLICT: 409, VALIDATION_ERROR: 422, INTERNAL_ERROR: 500 };
    if (result && codes[result.code] === response.status && typeof result.message === "string") {
      const ErrorType = { BAD_REQUEST: BadRequestError, FORBIDDEN: ForbiddenError,
        NOT_FOUND: NotFoundError, CONFLICT: ConflictError, VALIDATION_ERROR: ValidationError }[result.code];
      if (ErrorType) throw new ErrorType(result.message);
      throw new AppError(result.message, { statusCode: response.status, code: result.code });
    }
    throw unavailable();
  }
  try { return project(result); } catch (_error) { throw unavailable(); }
}

const ROW_FIELDS = ["id", "usuario_administrativo_id", "perfil", "diretoria_ensino_id",
  "unidade_escolar_id", "status", "data_inicio", "data_fim", "concedido_por_acesso_id",
  "criado_em", "atualizado_em", "usuario_cpf", "usuario_nome", "usuario_email", "usuario_ativo",
  "diretoria_ensino_nome", "unidade_escolar_nome", "unidade_diretoria_ensino_id"];
const validId = value => Number.isSafeInteger(value) && value > 0;
function accessRow(row) {
  if (!row || !validId(row.id) || !validId(row.usuario_administrativo_id)
      || typeof row.perfil !== "string" || typeof row.status !== "string"
      || typeof row.usuario_nome !== "string" || typeof row.usuario_ativo !== "boolean"
      || typeof row.usuario_cpf !== "string" || !/^\*{3}\.\*{3}\.\*{3}-(?:\d{2}|\*{2})$/.test(row.usuario_cpf)
      || ![row.diretoria_ensino_id, row.unidade_escolar_id, row.concedido_por_acesso_id,
        row.unidade_diretoria_ensino_id].every(id => id === null || validId(id))
      || ![row.data_inicio, row.data_fim, row.criado_em, row.atualizado_em, row.usuario_email,
        row.diretoria_ensino_nome, row.unidade_escolar_nome].every(value => value === null || typeof value === "string")) throw unavailable();
  return Object.fromEntries(ROW_FIELDS.map(field => [field, row[field]]));
}

function findById(acessoId) {
  return request("consultar", { id: Number(acessoId) }, result => result.acesso === null ? null : accessRow(result.acesso));
}

function listAcessos({ escopo, escopoUnidades, limit, offset }) {
  const allowed = Boolean(escopo?.temAcesso);
  const ids = values => [...new Set([...values].map(Number).filter(validId))];
  return request("listar", {
    global: allowed && Boolean(escopo.isSeduc),
    diretorias: allowed ? ids(escopo.diretoriasPermitidas || []) : [],
    unidades: allowed ? ids(Array.isArray(escopoUnidades) ? escopoUnidades : escopo.unidadesPermitidas || []) : [],
    limit, offset,
  }, result => {
    if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total) || result.total < 0) throw unavailable();
    return { items: result.items.map(accessRow), total: result.total };
  });
}

function createAcesso(body) {
  return request("conceder", body, result => {
    if (typeof result.criou_identidade !== "boolean") throw unavailable();
    return { acesso: accessRow(result.acesso), criou_identidade: result.criou_identidade };
  });
}
function updateStatus(body) { return request("alterar-status", body, accessRow); }
function resolveResource(body) {
  return request("recurso", body, result => {
    if (!result || !(result.educationDepartmentId === null || validId(result.educationDepartmentId))
        || !(result.schoolUnitId === null || validId(result.schoolUnitId))) throw unavailable();
    return { educationDepartmentId: result.educationDepartmentId, schoolUnitId: result.schoolUnitId };
  });
}
function listResources(body) {
  return request("recursos", body, result => {
    if (!Array.isArray(result.diretorias) || !Array.isArray(result.unidades)) throw unavailable();
    const project = row => {
      if (!validId(row.id) || typeof row.nome !== "string"
          || !(row.diretoria_ensino_id === null || validId(row.diretoria_ensino_id))) throw unavailable();
      return { id: row.id, nome: row.nome, diretoria_ensino_id: row.diretoria_ensino_id };
    };
    return { diretorias: result.diretorias.map(project), unidades: result.unidades.map(project) };
  });
}

module.exports = { findById, listAcessos, createAcesso, updateStatus, resolveResource, listResources };
