"use strict";

const database = require("../config/database");

// getClient: transação explícita ou conexão padrão.
function getClient(client) {
  return client || database;
}

async function withTransaction(callback) {
  return database.withTransaction(callback);
}

// Trecho SQL reutilizável: dados básicos do administrativo.
// Schema real (ponto_backup.sql): usuarios_administrativos é keyed por cpf
// próprio — NÃO possui funcionario_id nem govbr_sub. O concessório é uma
// identidade admin independente do cadastro de funcionários.
const ADMIN_BASIC_SELECT = `
  ua.id, ua.cpf, ua.nome, ua.email, ua.ativo,
  ua.ultimo_login_em, ua.criado_em, ua.atualizado_em
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

// Localiza o administrativo pelo seu próprio CPF (não via funcionários).
async function findByCpf(cpf, client) {
  return getClient(client).executeOne(
    `SELECT ${ADMIN_BASIC_SELECT} FROM usuarios_administrativos ua
     WHERE ua.cpf = ? AND ua.ativo = 1 LIMIT 1`,
    [cpf]
  );
}

// find-or-create de identidade admin: cria o usuário administrativo quando o
// CPF ainda não existe. Espera ser chamado dentro de uma transação (client
// passado explicitamente), logo antes de conceder o acesso.
async function create(client, { cpf, nome, email, ativo = true } = {}) {
  return getClient(client).execute(
    "INSERT INTO usuarios_administrativos (cpf, nome, email, ativo) VALUES (?, ?, ?, ?)",
    [cpf, nome, email ?? null, ativo ? 1 : 0]
  );
}

async function updateLastLogin(adminId, client) {
  return getClient(client).execute(
    "UPDATE usuarios_administrativos SET ultimo_login_em = CURRENT_TIMESTAMP WHERE id = ?",
    [adminId]
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
  create,
  updateLastLogin,
  findByEmail,
  findAcessosAtivosPorUsuario,
};
