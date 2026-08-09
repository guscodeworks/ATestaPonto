"use strict";

const database = require("../config/database");

// Permite que as queries participem de uma transação (client passado
// explicitamente) ou usem a conexão padrão do módulo, alinhado aos demais
// models.
function getClient(client) {
  return client || database;
}

// NOVO SCHEMA: a geolocalização de batida passou a residir em `unidades_escolares`
// (latitude, longitude, raio_permitido_metros), por unidade — antes vinha de
// variáveis de ambiente globais (SCHOOL_LATITUDE/LONGITUDE/ALLOWED_RADIUS_METERS).
// Este Model é somente leitura: criar/atualizar escolas fica fora do escopo
// da migração atual (a tarefa pede apenas consultas).

// Colunas básicas da unidade escolar, reutilizadas pelas leituras. Qualificadas
// com `ue.` para permanecerem sem ambiguidade nas leituras que fazem JOIN
// (findByVinculo / findGeolocationByVinculo), no mesmo padrão do vinculoModel.
const UNIDADE_SELECT = `
  ue.id, ue.diretoria_ensino_id, ue.nome, ue.latitude, ue.longitude, ue.raio_permitido_metros,
  ue.ativa, ue.codigo_inep, ue.endereco, ue.cidade, ue.criado_em, ue.atualizado_em
`;

/**
 * Retorna a escola por id (sem travar).
 */
async function findById(escolaId, client) {
  return getClient(client).executeOne(
    `SELECT ${UNIDADE_SELECT} FROM unidades_escolares ue WHERE ue.id = ? LIMIT 1`,
    [escolaId]
  );
}

/**
 * Trava a escola para alteração dentro de uma transação.
 */
async function findByIdForUpdate(client, escolaId) {
  return getClient(client).executeOne(
    `SELECT ${UNIDADE_SELECT} FROM unidades_escolares ue WHERE ue.id = ? LIMIT 1 FOR UPDATE`,
    [escolaId]
  );
}

/**
 * Escola associada a um vínculo funcional (via vinculos_funcionais.unidade_escolar_id).
 * Caminho usado para resolver a unidade a partir do vínculo do funcionário
 * (ex.: geolocalização no registro de ponto).
 */
async function findByVinculo(vinculoId, client) {
  return getClient(client).executeOne(
    `SELECT ${UNIDADE_SELECT} FROM unidades_escolares ue INNER JOIN vinculos_funcionais v ON v.unidade_escolar_id = ue.id WHERE v.id = ? LIMIT 1`,
    [vinculoId]
  );
}

/**
 * Dados de geolocalização de uma escola (latitude, longitude, raio_permitido_metros).
 * Subset enxuto para a validação de raio ao bater ponto.
 */
async function findGeolocationById(escolaId, client) {
  return getClient(client).executeOne(
    "SELECT ue.id, ue.latitude, ue.longitude, ue.raio_permitido_metros FROM unidades_escolares ue WHERE ue.id = ? LIMIT 1",
    [escolaId]
  );
}

/**
 * Geolocalização da escola associada a um vínculo. Resolve direto a partir do
 * `vinculo_funcional_id` (chave usada por registro_de_pontos), sem precisar
 * consultar o funcionário antes.
 */
async function findGeolocationByVinculo(vinculoId, client) {
  return getClient(client).executeOne(
    "SELECT ue.id, ue.latitude, ue.longitude, ue.raio_permitido_metros FROM unidades_escolares ue INNER JOIN vinculos_funcionais v ON v.unidade_escolar_id = ue.id WHERE v.id = ? LIMIT 1",
    [vinculoId]
  );
}

/**
 * Lista escolas, com filtro opcional de ativa (true/false).
 */
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

/**
 * Escolas vinculadas a uma diretoria de ensino.
 */
async function findByDiretoriaId(diretoriaEnsinoId, client) {
  return getClient(client).execute(
    `SELECT ${UNIDADE_SELECT} FROM unidades_escolares ue WHERE ue.diretoria_ensino_id = ? ORDER BY ue.nome ASC`,
    [diretoriaEnsinoId]
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
