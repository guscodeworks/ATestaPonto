"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

// diretorias_ensino agrupa unidades escolares (nome/codigo UNIQUE). O DELETE
// é bloqueado pelo banco (FK ON DELETE RESTRICT) se houver unidades vinculadas.

// Colunas básicas; `de.` qualifica para JOINs futuros sem ambiguidade.
const DIRETORIA_SELECT = `
  de.id, de.nome, de.codigo, de.cidade_sede, de.ativo, de.criado_em, de.atualizado_em
`;

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

async function findById(diretoriaId, client) {
  return getClient(client).executeOne(
    `SELECT ${DIRETORIA_SELECT} FROM diretorias_ensino de WHERE de.id = ? LIMIT 1`,
    [diretoriaId]
  );
}

// Trava a diretoria para alteração dentro de uma transação.
async function findByIdForUpdate(client, diretoriaId) {
  return getClient(client).executeOne(
    `SELECT ${DIRETORIA_SELECT} FROM diretorias_ensino de WHERE de.id = ? LIMIT 1 FOR UPDATE`,
    [diretoriaId]
  );
}

// Busca por código (coluna UNIQUE).
async function findByCodigo(codigo, client) {
  return getClient(client).executeOne(
    `SELECT ${DIRETORIA_SELECT} FROM diretorias_ensino de WHERE de.codigo = ? LIMIT 1`,
    [codigo]
  );
}

// ativo default true quando omitido.
async function createDiretoria(
  client,
  { nome, codigo, cidadeSede, ativo = true }
) {
  return getClient(client).execute(
    "INSERT INTO diretorias_ensino (nome, codigo, cidade_sede, ativo) VALUES (?, ?, ?, ?)",
    [nome, codigo, cidadeSede, ativo ? 1 : 0]
  );
}

// Allowlist campo→SQL; nomes de coluna nunca interpolados da requisição (anti SQL injection).
const DIRETORIA_UPDATE_ALLOWLIST = Object.freeze({
  nome: "UPDATE diretorias_ensino SET nome = ? WHERE id = ?",
  codigo: "UPDATE diretorias_ensino SET codigo = ? WHERE id = ?",
  cidadeSede: "UPDATE diretorias_ensino SET cidade_sede = ? WHERE id = ?",
  ativo: "UPDATE diretorias_ensino SET ativo = ? WHERE id = ?",
});

// Atualiza só os campos fornecidos; dentro de transação, após findByIdForUpdate.
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

// Falha com erro de constraint do banco se houver unidades vinculadas (FK ON DELETE RESTRICT).
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
