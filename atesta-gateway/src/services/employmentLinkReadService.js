"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError } = require("../utils/errors");

function unavailable() {
  return new AppError("Servico de consultas de vinculos funcionais indisponivel", {
    statusCode: 502,
    code: "EMPLOYMENT_LINK_READ_SERVICE_UNAVAILABLE",
  });
}

async function findScopeLink(funcionarioId, kind) {
  if (!Number.isSafeInteger(funcionarioId) || funcionarioId < 1) {
    throw unavailable();
  }
  let response;
  let body;
  try {
    response = await requestSpring(
      `/internal/vinculos-funcionais/funcionarios/${funcionarioId}/${kind}`,
      { method: "GET" }
    );
    const raw = await response.text();
    body = raw ? JSON.parse(raw) : null;
  } catch (_error) {
    throw unavailable();
  }

  if (response.status === 404) return null;
  if (response.status !== 200 || !body
      || !Number.isSafeInteger(body.id) || body.id < 1
      || !Number.isSafeInteger(body.unidade_escolar_id) || body.unidade_escolar_id < 1
      || !(body.diretoria_ensino_id === null
        || (Number.isSafeInteger(body.diretoria_ensino_id) && body.diretoria_ensino_id > 0))) {
    throw unavailable();
  }
  return {
    id: body.id,
    unidade_escolar_id: body.unidade_escolar_id,
    diretoria_ensino_id: body.diretoria_ensino_id,
  };
}

function findActiveByEmployeeId(funcionarioId) {
  return findScopeLink(funcionarioId, "ativo");
}

function findVisibleForAdminByEmployeeId(funcionarioId) {
  return findScopeLink(funcionarioId, "visivel");
}

function findLatestByEmployeeId(funcionarioId) {
  return findScopeLink(funcionarioId, "mais-recente");
}

module.exports = {
  findActiveByEmployeeId,
  findVisibleForAdminByEmployeeId,
  findLatestByEmployeeId,
};
