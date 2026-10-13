"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError } = require("../utils/errors");

function validId(id) {
  return Number.isSafeInteger(id) && id > 0;
}

function projectSchool(row, administrative = false) {
  if (!row || !validId(row.id) || !validId(row.diretoria_ensino_id)
    || typeof row.nome !== "string" || typeof row.ativa !== "boolean"
    || !Number.isSafeInteger(row.raio_permitido_metros)
    || [row.latitude, row.longitude].some(value => value !== null && !Number.isFinite(value))
    || [row.codigo_inep, row.endereco, row.cidade].some(value => value !== null && typeof value !== "string")
    || [row.criado_em, row.atualizado_em].some(value => value !== null
      && (typeof value !== "string" || !Number.isFinite(Date.parse(value))))
    || (administrative && typeof row.diretoria_ensino_nome !== "string")) {
    throw new Error("Resposta escolar invalida");
  }
  return {
    id: row.id,
    diretoria_ensino_id: row.diretoria_ensino_id,
    ...(administrative ? { diretoria_ensino_nome: row.diretoria_ensino_nome } : {}),
    nome: row.nome,
    latitude: row.latitude,
    longitude: row.longitude,
    raio_permitido_metros: row.raio_permitido_metros,
    ativa: Number(row.ativa),
    codigo_inep: row.codigo_inep,
    endereco: row.endereco,
    cidade: row.cidade,
    criado_em: row.criado_em === null ? null : new Date(row.criado_em),
    atualizado_em: row.atualizado_em === null ? null : new Date(row.atualizado_em),
  };
}

async function readSchools(path, { method = "GET", body, missing = false } = {}, project) {
  try {
    const response = await requestSpring(path, { method, body });
    if (missing && response.status === 404) return null;
    if (response.status !== 200) throw new Error("Falha na consulta interna");
    return project(await response.json());
  } catch (_error) {
    throw new AppError("Servico de escolas indisponivel", {
      statusCode: 502,
      code: "SCHOOL_SERVICE_UNAVAILABLE",
    });
  }
}

async function findById(value, administrative = false) {
  const id = Number(value);
  if (!validId(id)) return null;
  const path = administrative ? `/internal/escolas/${id}/administracao` : `/internal/escolas/escopo/${id}`;
  return readSchools(path, { missing: true }, row => {
    const school = projectSchool(row, administrative);
    if (school.id !== id) throw new Error("Escola inesperada");
    return school;
  });
}

async function listByEducationDepartment(value) {
  const id = Number(value);
  if (!validId(id)) return [];
  return readSchools(`/internal/escolas/escopo?diretoria_ensino_id=${id}`, {}, rows => {
    if (!Array.isArray(rows)) throw new Error("Lista escolar invalida");
    return rows.map(row => {
      const school = projectSchool(row);
      if (school.diretoria_ensino_id !== id) throw new Error("DRE inesperada");
      return school;
    });
  });
}

async function listForRegistration(scope = []) {
  if (scope !== null && !Array.isArray(scope)) return [];
  const ids = scope === null ? null : [...new Set(scope.map(Number))];
  if (ids && (ids.length === 0 || ids.some(id => !validId(id)))) return [];
  const permitted = ids === null ? null : new Set(ids);
  return readSchools("/internal/escolas/cadastro/listagem", {
    method: "POST",
    body: { escopo_global: ids === null, unidades_escolares_ids: ids || [] },
  }, rows => {
    if (!Array.isArray(rows)) throw new Error("Lista escolar invalida");
    return rows.map(row => {
      if (!row || !validId(row.id) || typeof row.nome !== "string"
        || (permitted !== null && !permitted.has(row.id))) throw new Error("Unidade fora do escopo");
      return { id: row.id, nome: row.nome };
    });
  });
}

module.exports = { findById, listByEducationDepartment, listForRegistration };
