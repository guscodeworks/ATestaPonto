"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

// SQL e acesso às unidades escolares. A geolocalização da batida reside
// nesta tabela por unidade — antes vinha de env vars globais.

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
async function findByDiretoriaId(educationDepartmentId, { ativa } = {}, client) {
  const whereAtiva = ativa === true || ativa === false ? " AND ue.ativa = ?" : "";
  const params = [educationDepartmentId];
  if (whereAtiva) params.push(ativa ? 1 : 0);
  return getClient(client).execute(
    `SELECT ${UNIDADE_SELECT} FROM unidades_escolares ue WHERE ue.diretoria_ensino_id = ?${whereAtiva} ORDER BY ue.nome ASC`,
    params
  );
}

async function listByDiretoriaIds(diretoriaIds, { ativa } = {}, client) {
  if (!Array.isArray(diretoriaIds) || diretoriaIds.length === 0) return [];
  const ids = [...new Set(diretoriaIds.map(Number))];
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return [];
  const where = [`ue.diretoria_ensino_id IN (${ids.map(() => "?").join(",")})`];
  const params = [...ids];
  if (ativa === true || ativa === false) {
    where.push("ue.ativa = ?");
    params.push(ativa ? 1 : 0);
  }
  return getClient(client).execute(
    `SELECT ${UNIDADE_SELECT} FROM unidades_escolares ue WHERE ${where.join(" AND ")} ORDER BY ue.nome ASC`,
    params
  );
}

async function create(client, escola) {
  return getClient(client).execute(
    `INSERT INTO unidades_escolares
      (diretoria_ensino_id, nome, latitude, longitude, raio_permitido_metros, ativa, codigo_inep, endereco, cidade)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      escola.diretoria_ensino_id,
      escola.nome,
      escola.latitude,
      escola.longitude,
      escola.raio_permitido_metros,
      escola.ativa ? 1 : 0,
      escola.codigo_inep,
      escola.endereco,
      escola.cidade,
    ]
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

module.exports = {
  findById,
  findByIdForUpdate,
  findByVinculo,
  findGeolocationById,
  findGeolocationByVinculo,
  list,
  findByDiretoriaId,
  listByDiretoriaIds,
  create,
  listForEmployeeRegistration,
};
