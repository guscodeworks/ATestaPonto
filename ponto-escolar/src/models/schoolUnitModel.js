"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

// A geolocalização da batida reside em unidades_escolares (lat/lng/raio_permitido_metros),
// por unidade — antes vinha de env vars globais. Model só de leitura.

// Colunas básicas; `ue.` qualifica para JOINs sem ambiguidade.
const UNIDADE_SELECT = `
  ue.id, ue.diretoria_ensino_id, ue.nome, ue.latitude, ue.longitude, ue.raio_permitido_metros,
  ue.ativa, ue.codigo_inep, ue.endereco, ue.cidade, ue.criado_em, ue.atualizado_em
`;

async function findById(escolaId, client) {
  return getClient(client).executeOne(
    `SELECT ${UNIDADE_SELECT} FROM unidades_escolares ue WHERE ue.id = ? LIMIT 1`,
    [escolaId]
  );
}

// Trava a escola para alteração dentro de uma transação.
async function findByIdForUpdate(client, escolaId) {
  return getClient(client).executeOne(
    `SELECT ${UNIDADE_SELECT} FROM unidades_escolares ue WHERE ue.id = ? LIMIT 1 FOR UPDATE`,
    [escolaId]
  );
}

// Escola do vínculo (via vinculos_funcionais.unidade_escolar_id); uso: geolocalização no ponto.
async function findByVinculo(vinculoId, client) {
  return getClient(client).executeOne(
    `SELECT ${UNIDADE_SELECT} FROM unidades_escolares ue INNER JOIN vinculos_funcionais v ON v.unidade_escolar_id = ue.id WHERE v.id = ? LIMIT 1`,
    [vinculoId]
  );
}

// Subset enxuto de geolocalização para validar o raio ao bater ponto.
async function findGeolocationById(escolaId, client) {
  return getClient(client).executeOne(
    "SELECT ue.id, ue.latitude, ue.longitude, ue.raio_permitido_metros FROM unidades_escolares ue WHERE ue.id = ? LIMIT 1",
    [escolaId]
  );
}

// Geolocalização direto do vinculo_funcional_id (chave de registro_de_pontos), sem consultar o funcionário.
async function findGeolocationByVinculo(vinculoId, client) {
  return getClient(client).executeOne(
    "SELECT ue.id, ue.latitude, ue.longitude, ue.raio_permitido_metros FROM unidades_escolares ue INNER JOIN vinculos_funcionais v ON v.unidade_escolar_id = ue.id WHERE v.id = ? LIMIT 1",
    [vinculoId]
  );
}

async function list({ ativa } = {}, client) {
  const whereAtiva =
    ativa === true || ativa === false || ativa === 1 || ativa === 0
      ? "WHERE ue.ativa = ?"
      : "";
  const params = whereAtiva ? [ativa ? 1 : 0] : [];

  return getClient(client).execute(
    `SELECT ${UNIDADE_SELECT} FROM unidades_escolares ue ${whereAtiva} ORDER BY ue.nome ASC`,
    params
  );
}

// Escolas vinculadas a uma diretoria de ensino.
async function findByDiretoriaId(educationDepartmentId, client) {
  return getClient(client).execute(
    `SELECT ${UNIDADE_SELECT} FROM unidades_escolares ue WHERE ue.diretoria_ensino_id = ? ORDER BY ue.nome ASC`,
    [educationDepartmentId]
  );
}

async function listForEmployeeRegistration(escopoUnidades = []) {
  if (escopoUnidades !== null && !Array.isArray(escopoUnidades)) return [];
  if (Array.isArray(escopoUnidades) && escopoUnidades.length === 0) return [];

  const ids = escopoUnidades === null
    ? null
    : [...new Set(escopoUnidades.map(Number))];
  if (ids && ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return [];

  const filtro = ids ? `WHERE ue.id IN (${ids.map(() => "?").join(",")})` : "";
  return database.execute(
    `SELECT ue.id, ue.nome FROM unidades_escolares ue ${filtro} ORDER BY ue.nome ASC, ue.id ASC`,
    ids || []
  );
}

// ---------------------------------------------------------------------------
// Gestão administrativa de escolas (cadastro e consulta).
// As colunas de endereço/CEP vêm da migration 20261001_unidades_escolares_endereco;
// por isso ficam num SELECT próprio e o UNIDADE_SELECT acima (usado no fluxo de
// ponto) continua funcionando mesmo antes da migration ser aplicada.
// ---------------------------------------------------------------------------

const UNIDADE_ADMIN_SELECT = `
  ue.id, ue.diretoria_ensino_id, de.nome AS diretoria_ensino_nome, ue.nome,
  ue.codigo_inep, ue.endereco, ue.cidade,
  ue.latitude, ue.longitude, ue.raio_permitido_metros,
  ue.ativa, ue.criado_em, ue.atualizado_em
`;
const UNIDADE_ADMIN_FROM = `
  FROM unidades_escolares ue
  INNER JOIN diretorias_ensino de ON de.id = ue.diretoria_ensino_id
`;

async function withTransaction(callback) {
  return database.withTransaction(callback);
}

async function findAdminById(escolaId, client) {
  return getClient(client).executeOne(
    `SELECT ${UNIDADE_ADMIN_SELECT} ${UNIDADE_ADMIN_FROM} WHERE ue.id = ? LIMIT 1`,
    [escolaId]
  );
}

async function findByCodigoInep(client, codigoInep) {
  return getClient(client).executeOne(
    "SELECT ue.id FROM unidades_escolares ue WHERE ue.codigo_inep = ? LIMIT 1",
    [codigoInep]
  );
}

// A collation utf8mb4_unicode_ci já ignora caixa e acentos na comparação.
async function findByNomeNaDiretoria(client, diretoriaId, nome) {
  return getClient(client).executeOne(
    "SELECT ue.id FROM unidades_escolares ue WHERE ue.diretoria_ensino_id = ? AND ue.nome = ? LIMIT 1",
    [diretoriaId, nome]
  );
}

async function createSchoolUnit(client, dados) {
  return getClient(client).execute(
    `INSERT INTO unidades_escolares
      (diretoria_ensino_id, nome, codigo_inep, endereco, cidade,
       latitude, longitude, raio_permitido_metros)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dados.diretoriaEnsinoId,
      dados.nome,
      dados.codigoInep,
      dados.endereco,
      dados.cidade,
      dados.latitude,
      dados.longitude,
      dados.raioPermitidoMetros,
    ]
  );
}

// Monta o WHERE da listagem. `escopoUnidades`: null = sem restrição (SEDUC);
// array = só essas unidades; [] = nada visível. Sempre parametrizado.
function buildAdminListFilter({ escopoUnidades, diretoriaId, ativa, q } = {}) {
  if (escopoUnidades !== null && !Array.isArray(escopoUnidades)) {
    return { vazio: true, where: "", params: [] };
  }

  const condicoes = [];
  const params = [];

  if (Array.isArray(escopoUnidades)) {
    const ids = [...new Set(escopoUnidades.map(Number))].filter(
      (id) => Number.isSafeInteger(id) && id > 0
    );
    if (ids.length === 0) {
      return { vazio: true, where: "", params: [] };
    }
    condicoes.push(`ue.id IN (${ids.map(() => "?").join(",")})`);
    params.push(...ids);
  }

  if (Number.isSafeInteger(diretoriaId) && diretoriaId > 0) {
    condicoes.push("ue.diretoria_ensino_id = ?");
    params.push(diretoriaId);
  }

  if (ativa === true || ativa === false) {
    condicoes.push("ue.ativa = ?");
    params.push(ativa ? 1 : 0);
  }

  if (typeof q === "string" && q.trim()) {
    // Escapa curingas do LIKE para a busca ser literal.
    const termo = q.trim().replace(/[\\%_]/g, "\\$&");
    condicoes.push("(ue.nome LIKE ? OR ue.codigo_inep LIKE ?)");
    params.push(`%${termo}%`, `%${termo}%`);
  }

  return {
    vazio: false,
    where: condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "",
    params,
  };
}

async function listForAdmin(filtros = {}, client) {
  const { vazio, where, params } = buildAdminListFilter(filtros);
  if (vazio) return [];

  return getClient(client).execute(
    `SELECT ${UNIDADE_ADMIN_SELECT} ${UNIDADE_ADMIN_FROM} ${where}
     ORDER BY ue.nome ASC, ue.id ASC LIMIT ? OFFSET ?`,
    [...params, String(Number(filtros.limit)), String(Number(filtros.offset))]
  );
}

async function countForAdmin(filtros = {}, client) {
  const { vazio, where, params } = buildAdminListFilter(filtros);
  if (vazio) return { total: 0 };

  return getClient(client).executeOne(
    `SELECT COUNT(*) AS total ${UNIDADE_ADMIN_FROM} ${where}`,
    params
  );
}

module.exports = {
  findById,
  findByIdForUpdate,
  findByVinculo,
  findGeolocationById,
  findGeolocationByVinculo,
  list,
  findByDiretoriaId,
  listForEmployeeRegistration,
  withTransaction,
  findAdminById,
  findByCodigoInep,
  findByNomeNaDiretoria,
  createSchoolUnit,
  listForAdmin,
  countForAdmin,
};
