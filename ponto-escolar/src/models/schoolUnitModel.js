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

module.exports = {
  findById,
  findByIdForUpdate,
  findByVinculo,
  findGeolocationById,
  findGeolocationByVinculo,
  list,
  findByDiretoriaId,
};
