"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError } = require("../utils/errors");
const { BadRequestError } = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");

function departmentId(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))
    || Number(value) < 1 || Number(value) > 4294967295) {
    throw new BadRequestError("ID de DRE invalido");
  }
  return Number(value);
}

function projectDepartment(row) {
  if (!row || !Number.isSafeInteger(row.id) || row.id <= 0
    || typeof row.nome !== "string" || typeof row.codigo !== "string"
    || typeof row.cidade_sede !== "string" || typeof row.ativo !== "boolean") {
    throw new AppError("Resposta invalida do servico de DREs", { statusCode: 502 });
  }
  return { id: row.id, nome: row.nome, codigo: row.codigo, cidade_sede: row.cidade_sede, ativo: row.ativo };
}

function departmentData(body) {
  const data = {};
  for (const [field, limit] of Object.entries({ nome: 150, codigo: 50, cidade_sede: 100 })) {
    if (typeof body?.[field] !== "string" || !body[field].trim() || body[field].trim().length > limit) {
      throw new BadRequestError(`Campo ${field} obrigatorio, com ate ${limit} caracteres`);
    }
    data[field] = body[field].trim();
  }
  return data;
}

async function administrativeRequest(path, method = "GET", body) {
  let response;
  let result;
  try {
    response = await requestSpring(path, { method, body });
    result = await response.json();
  } catch (_error) {
    throw new AppError("Servico de DREs indisponivel. Consulte a lista antes de tentar novamente.", {
      statusCode: 502, code: "EDUCATION_DEPARTMENT_SERVICE_UNAVAILABLE",
    });
  }
  if (![200, 201].includes(response.status)) {
    const known = [400, 404, 409].includes(response.status);
    throw new AppError(known && typeof result?.detail === "string"
      ? result.detail : "Nao foi possivel concluir a operacao de DRE", {
      statusCode: known ? response.status : 502,
      code: response.status === 409 ? "EDUCATION_DEPARTMENT_CONFLICT" : "EDUCATION_DEPARTMENT_ERROR",
    });
  }
  return result;
}

async function listAdministrative(ativo) {
  if (ativo !== undefined && !["true", "false"].includes(ativo)) {
    throw new BadRequestError("Status de DRE invalido");
  }
  const rows = await administrativeRequest(`/internal/diretorias${ativo === undefined ? "" : `?ativo=${ativo}`}`);
  if (!Array.isArray(rows)) throw new AppError("Resposta invalida do servico de DREs", { statusCode: 502 });
  return rows.map(projectDepartment);
}

async function mutateDepartment(path, method, body, event, context) {
  const result = projectDepartment(await administrativeRequest(path, method, body));
  try {
    await registerAuditLog({
      evento: event, mensagem: "Gestao administrativa de DRE",
      adminId: context.adminId, ipOrigem: context.ipOrigem,
      metadados: { diretoriaEnsinoId: result.id, ...result },
    });
  } catch (_error) {
    // Uma falha de auditoria não deve induzir repetição de uma gravação já confirmada.
  }
  return result;
}

function create(body, context) {
  return mutateDepartment("/internal/diretorias", "POST", departmentData(body), "diretoria_criada", context);
}

function update(id, body, context) {
  return mutateDepartment(`/internal/diretorias/${departmentId(id)}`, "PUT", departmentData(body), "diretoria_editada", context);
}

function changeStatus(id, body, context) {
  if (typeof body?.ativo !== "boolean") throw new BadRequestError("Informe ativo como booleano");
  return mutateDepartment(`/internal/diretorias/${departmentId(id)}/status`, "PUT", { ativo: body.ativo },
    body.ativo ? "diretoria_ativada" : "diretoria_desativada", context);
}

async function list(ativo) {
  try {
    const query = ativo === undefined
      ? ""
      : `?ativo=${ativo}`;

    const response = await requestSpring(`/internal/diretorias${query}`, {
      method: "GET",
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  } catch (_error) {
    throw new AppError("Servico de diretorias indisponivel", {
      statusCode: 502,
      code: "EDUCATION_DEPARTMENT_SERVICE_UNAVAILABLE",
    });
  }
}

async function findById(id) {
  try {
    const response = await requestSpring(`/internal/diretorias/${id}`, {
      method: "GET",
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  } catch (_error) {
    throw new AppError("Servico de diretorias indisponivel", {
      statusCode: 502,
      code: "EDUCATION_DEPARTMENT_SERVICE_UNAVAILABLE",
    });
  }
}

module.exports = {
  list,
  findById,
  listAdministrative,
  create,
  update,
  changeStatus,
};
