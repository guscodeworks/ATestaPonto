"use strict";

const database = require("../config/database");

// Permite que as queries participem de uma transação (client passado explicitamente)
// ou usem a conexão padrão do módulo, quando chamadas fora de uma transação.
function getClient(client) {
  return client || database;
}

async function withTransaction(callback) {
  return database.withTransaction(callback);
}

// Trecho SQL reutilizável: dados básicos do administrativo
const ADMIN_BASIC_SELECT = `
  ua.id, ua.funcionario_id, ua.govbr_sub, ua.email, ua.nome,
  ua.ultimo_login_em, ua.criado_em, ua.atualizado_em, ua.ativo
`;

async function findById(adminId, client) {
  return getClient(client).executeOne(
    `SELECT ${ADMIN_BASIC_SELECT} FROM usuarios_administrativos ua WHERE ua.id = ? LIMIT 1`,
    [adminId]
  );
}

async function findByCpf(cpf, client) {
  return getClient(client).executeOne(
    `SELECT ${ADMIN_BASIC_SELECT} FROM usuarios_administrativos ua
     INNER JOIN funcionarios f ON f.id = ua.funcionario_id
     WHERE f.cpf = ? AND ua.ativo = 1 LIMIT 1`,
    [cpf]
  );
}

async function updateLastLogin(adminId, client) {
  return getClient(client).execute(
    "UPDATE usuarios_administrativos SET ultimo_login_em = CURRENT_TIMESTAMP WHERE id = ?",
    [adminId]
  );
}

async function findByGovbrSub(govbrSub, client) {
  return getClient(client).executeOne(
    `SELECT ${ADMIN_BASIC_SELECT} FROM usuarios_administrativos ua WHERE ua.govbr_sub = ? AND ua.ativo = 1 LIMIT 1`,
    [govbrSub]
  );
}

async function findByEmail(email, client) {
  return getClient(client).executeOne(
    `SELECT ${ADMIN_BASIC_SELECT} FROM usuarios_administrativos ua WHERE ua.email = ? AND ua.ativo = 1 LIMIT 1`,
    [email.toLowerCase()]
  );
}

module.exports = {
  withTransaction,
  findById,
  findByCpf,
  updateLastLogin,
  findByGovbrSub,
  findByEmail
};