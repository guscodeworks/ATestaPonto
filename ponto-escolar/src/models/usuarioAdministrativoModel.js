"use strict";

const database = require("../config/database");

// getClient: transação explícita ou conexão padrão.
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

// Trecho SQL reutilizável: dados básicos de acesso administrativo
const ACESSO_BASIC_SELECT = `
  aa.id, aa.usuario_administrativo_id, aa.perfil, aa.diretoria_ensino_id, 
  aa.unidade_escolar_id, aa.status, aa.data_inicio, aa.data_fim, 
  aa.concedido_por_acesso_id, aa.criado_em, aa.atualizado_em
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

// Novo método: buscar acessos ativos e válidos para um administrativo
async function findAcessosAtivosPorUsuario(adminId, client) {
  const query = `
    SELECT ${ACESSO_BASIC_SELECT} 
    FROM acessos_administrativos aa 
    WHERE aa.usuario_administrativo_id = ? 
      AND aa.status = 'ATIVO' 
      AND (
        aa.data_inicio IS NULL OR aa.data_inicio <= CURRENT_DATE
      ) 
      AND (
        aa.data_fim IS NULL OR aa.data_fim >= CURRENT_DATE
      )
    ORDER BY aa.criado_em DESC
  `;
  
  return getClient(client).execute(query, [adminId]);
}

module.exports = {
  withTransaction,
  findById,
  findByCpf,
  updateLastLogin,
  findByGovbrSub,
  findByEmail,
  findAcessosAtivosPorUsuario
};
