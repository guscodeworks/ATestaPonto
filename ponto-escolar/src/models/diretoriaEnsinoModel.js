"use strict";

const database = require("../config/database");

// Permite que as queries participem de uma transação (client passado
// explicitamente) ou usem a conexão padrão do módulo, alinhado aos demais
// models.
function getClient(client) {
  return client || database;
}

// NOVO SCHEMA: `diretorias_ensino` agrupa unidades escolares. Colunas: id,
// nome (UNIQUE), codigo (UNIQUE), cidade_sede, ativo, criado_em, atualizado_em.
// CRUD compatível: criar/ler/atualizar/excluir. A exclusão é bloqueada pelo
// banco (FK unidades_escolares.diretoria_ensino_id ON DELETE RESTRICT) quando
// ainda existem unidades vinculadas — o Model apenas executa o DELETE; a
// decisão de integridade referencial é do banco.

// Colunas básicas, reutilizadas pelas leituras. Qualificadas com `de.` no
// mesmo padrão dos demais models, evitando ambiguidade em JOINs futuros.
const DIRETORIA_SELECT = `
  de.id, de.nome, de.codigo, de.cidade_sede, de.ativo, de.criado_em, de.atualizado_em
`;

/**
 * Lista diretorias, com filtro opcional de ativo (true/false).
 */
async function list({ ativo } = {}, client) {
  const whereAtivo =
    ativo === true || ativo === false || ativo === 1 || ativo === 0
      ? "WHERE de.ativo = ?"
      : "";
  const params = whereAtivo ? [ativo ? 1 : 0] : [];

  return getClient(client).execute(
    `SELECT ${DIRETORIA_SELECT} FROM diretorias_ensino de ${whereAtivo} ORDER BY de.nome ASC`,
    params
  );
}

/**
 * Retorna a diretoria por id (sem travar).
 */
async function findById(diretoriaId, client) {
  return getClient(client).executeOne(
    `SELECT ${DIRETORIA_SELECT} FROM diretorias_ensino de WHERE de.id = ? LIMIT 1`,
    [diretoriaId]
  );
}

/**
 * Trava a diretoria para alteração dentro de uma transação.
 */
async function findByIdForUpdate(client, diretoriaId) {
  return getClient(client).executeOne(
    `SELECT ${DIRETORIA_SELECT} FROM diretorias_ensino de WHERE de.id = ? LIMIT 1 FOR UPDATE`,
    [diretoriaId]
  );
}

/**
 * Busca diretoria por código (coluna UNIQUE).
 */
async function findByCodigo(codigo, client) {
  return getClient(client).executeOne(
    `SELECT ${DIRETORIA_SELECT} FROM diretorias_ensino de WHERE de.codigo = ? LIMIT 1`,
    [codigo]
  );
}

/**
 * Cria uma diretoria de ensino. `ativo` default true quando omitido.
 */
async function createDiretoria(
  client,
  { nome, codigo, cidadeSede, ativo = true }
) {
  return getClient(client).execute(
    "INSERT INTO diretorias_ensino (nome, codigo, cidade_sede, ativo) VALUES (?, ?, ?, ?)",
    [nome, codigo, cidadeSede, ativo ? 1 : 0]
  );
}

// Mapeia campos lógicos (recebidos do service) -> SQL de atualização de uma
// coluna só, no mesmo estilo da allowlist dos demais models. Os nomes de
// coluna nunca são interpolados a partir da requisição (seguro contra SQL
// injection).
const DIRETORIA_UPDATE_ALLOWLIST = Object.freeze({
  nome: "UPDATE diretorias_ensino SET nome = ? WHERE id = ?",
  codigo: "UPDATE diretorias_ensino SET codigo = ? WHERE id = ?",
  cidadeSede: "UPDATE diretorias_ensino SET cidade_sede = ? WHERE id = ?",
  ativo: "UPDATE diretorias_ensino SET ativo = ? WHERE id = ?",
});

/**
 * Atualiza somente os campos fornecidos, preservando os demais. Espera ser
 * chamado dentro de uma transação, preferencialmente após findByIdForUpdate.
 */
async function updateDiretoria(client, diretoriaId, fields = {}) {
  let lastResult = { affectedRows: 0 };
  let totalAffectedRows = 0;

  for (const field of Object.keys(DIRETORIA_UPDATE_ALLOWLIST)) {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) {
      continue;
    }

    const value =
      field === "ativo" ? (fields[field] ? 1 : 0) : fields[field];
    lastResult = await getClient(client).execute(
      DIRETORIA_UPDATE_ALLOWLIST[field],
      [value, diretoriaId]
    );
    totalAffectedRows += Number(lastResult.affectedRows || 0);
  }

  return {
    ...lastResult,
    affectedRows: totalAffectedRows,
  };
}

/**
 * Exclui uma diretoria. Falha com erro de constraint do banco se ainda houver
 * unidades escolares vinculadas (FK ON DELETE RESTRICT).
 */
async function deleteDiretoria(client, diretoriaId) {
  return getClient(client).execute(
    "DELETE FROM diretorias_ensino WHERE id = ?",
    [diretoriaId]
  );
}

module.exports = {
  list,
  findById,
  findByIdForUpdate,
  findByCodigo,
  createDiretoria,
  updateDiretoria,
  deleteDiretoria,
};
