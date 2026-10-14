"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError } = require("../utils/errors");

function unavailable() {
  return new AppError("Servico de consultas de funcionarios indisponivel", {
    statusCode: 502,
    code: "EMPLOYEE_READ_SERVICE_UNAVAILABLE",
  });
}

function validNullableString(value) {
  return value === null || typeof value === "string";
}

function projectListItem(row) {
  if (!row || !Number.isSafeInteger(row.id) || row.id < 1
      || typeof row.nome !== "string" || !/^\d{11}$/.test(row.cpf || "")
      || typeof row.email !== "string" || typeof row.ativo !== "boolean"
      || !validNullableString(row.telefone) || !validNullableString(row.desativado_em)
      || !validNullableString(row.criado_em) || !validNullableString(row.cargo)
      || !validNullableString(row.entrada) || !validNullableString(row.saida_almoco)
      || !validNullableString(row.retorno_almoco) || !validNullableString(row.saida)
      || !(row.cargo_id === null || (Number.isSafeInteger(row.cargo_id) && row.cargo_id > 0))) {
    throw unavailable();
  }
  return {
    id: row.id,
    nome: row.nome,
    cpf: row.cpf,
    email: row.email,
    telefone: row.telefone,
    ativo: row.ativo,
    desativado_em: row.desativado_em,
    criado_em: row.criado_em,
    cargo_id: row.cargo_id,
    cargo: row.cargo,
    entrada: row.entrada,
    saida_almoco: row.saida_almoco,
    retorno_almoco: row.retorno_almoco,
    saida: row.saida,
  };
}

function projectPagination(pagination, page, limit) {
  if (!pagination || !Number.isSafeInteger(pagination.page) || pagination.page !== page
      || !Number.isInteger(pagination.limit) || pagination.limit !== limit
      || !Number.isSafeInteger(pagination.total) || pagination.total < 0) {
    throw unavailable();
  }
  return { page: pagination.page, limit: pagination.limit, total: pagination.total };
}

async function requestJson(path, options) {
  try {
    const response = await requestSpring(path, options);
    let body = null;
    const raw = await response.text();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch (_error) {
        throw unavailable();
      }
    }
    return { status: response.status, body };
  } catch (_error) {
    throw unavailable();
  }
}

async function listEmployees({ ativo, cargo, q, page, limit } = {}, escopoUnidades = []) {
  // Apenas null representa escopo global autorizado pelo middleware Node.
  // Ausência, valor inválido ou lista vazia ficam restritos (fail-closed).
  const escopoGlobal = escopoUnidades === null;
  const unidadesPermitidas = Array.isArray(escopoUnidades) ? escopoUnidades : [];
  const { status, body } = await requestJson("/internal/funcionarios/listagem", {
    method: "POST",
    body: {
      escopo_global: escopoGlobal,
      unidades_escolares_ids: unidadesPermitidas,
      ativo: typeof ativo === "boolean" ? ativo : null,
      cargo: String(cargo || "").trim().toUpperCase(),
      q: String(q || "").trim(),
      page,
      limit,
    },
  });

  if (status !== 200 || !Array.isArray(body?.items)) throw unavailable();
  return {
    items: body.items.map(projectListItem),
    pagination: projectPagination(body.pagination, page, limit),
  };
}

async function findAdminEmployeeById(funcionarioId, vinculoId) {
  const { status, body } = await requestJson("/internal/funcionarios/consultar", {
    method: "POST",
    body: { funcionario_id: funcionarioId, vinculo_id: vinculoId },
  });
  if (status === 404) return null;
  if (status !== 200 || !body || !Number.isSafeInteger(body.id) || body.id !== funcionarioId
      || typeof body.nome !== "string" || !/^\d{11}$/.test(body.cpf || "")
      || typeof body.email !== "string" || !validNullableString(body.telefone)
      || !validNullableString(body.cargo) || !validNullableString(body.entrada)
      || !validNullableString(body.saida_almoco) || !validNullableString(body.retorno_almoco)
      || !validNullableString(body.saida)) {
    throw unavailable();
  }
  return {
    id: body.id,
    nome: body.nome,
    cpf: body.cpf,
    email: body.email,
    telefone: body.telefone,
    cargo: body.cargo,
    entrada: body.entrada,
    saida_almoco: body.saida_almoco,
    retorno_almoco: body.retorno_almoco,
    saida: body.saida,
  };
}

module.exports = {
  listEmployees,
  findAdminEmployeeById,
};
