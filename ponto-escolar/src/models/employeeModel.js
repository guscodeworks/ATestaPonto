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

// Query base reutilizada em múltiplas consultas que precisam do nome do cargo junto
// com os dados do funcionário, evitando duplicar o JOIN em cada função.
const EMPLOYEE_WITH_CARGO_SELECT = `
  SELECT f.id, f.cpf, f.nome, f.email, f.ativo, f.criado_em, f.primeiro_acesso, f.cargo_id, f.login_id, c.nome AS cargo_nome
  FROM funcionarios f
  LEFT JOIN cargo c ON c.id = f.cargo_id
`;

// Monta filtros dinâmicos de forma parametrizada (evitando SQL injection) para
// serem reaproveitados tanto na contagem quanto na listagem paginada de funcionários.
function buildEmployeeFilters({ ativo, q } = {}) {
  const filters = [];
  const params = [];

  if (typeof ativo === "boolean") {
    filters.push("f.ativo = ?");
    params.push(ativo ? 1 : 0);
  }

  if (q) {
    filters.push("(f.nome LIKE ? OR f.email LIKE ? OR f.cpf LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  return {
    whereClause: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
    params,
  };
}

async function findById(employeeId, client) {
  return getClient(client).executeOne(
    `${EMPLOYEE_WITH_CARGO_SELECT}
     WHERE f.id = ?
     LIMIT 1`,
    [employeeId]
  );
}

// FOR UPDATE bloqueia a linha do funcionário para evitar condição de corrida em
// atualizações concorrentes (ex: duas requisições de update simultâneas) dentro de transação.
async function findByIdForUpdate(client, employeeId) {
  return getClient(client).executeOne(
    "SELECT id, cpf, email, ativo, cargo_id, login_id FROM funcionarios WHERE id = ? LIMIT 1 FOR UPDATE",
    [employeeId]
  );
}

// Bloqueia a linha durante o registro de ponto para evitar que o mesmo funcionário
// seja desativado/alterado concorrentemente enquanto o ponto está sendo processado.
async function findForPunchRegisterByIdForUpdate(client, employeeId) {
  return getClient(client).executeOne(
    `SELECT id, cpf, nome, email, ativo
     FROM funcionarios
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [employeeId]
  );
}

async function findForPunchLoginByCpf(cpf) {
  return database.executeOne(
    `SELECT id, cpf, nome, email, senha, ativo
     FROM funcionarios
     WHERE cpf = ?
     LIMIT 1`,
    [cpf]
  );
}

async function findForPunchLoginByEmail(email) {
  return database.executeOne(
    `SELECT id, cpf, nome, email, senha, ativo
     FROM funcionarios
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
}

// Usada no fluxo de login legado: retorna apenas funcionários ativos e inclui
// "primeiro_acesso" pois esse fluxo trata diferente o caso de troca de senha obrigatória.
async function findActiveForLegacyLoginByCpf(cpf) {
  return database.executeOne(
    "SELECT id, cpf, nome, primeiro_acesso FROM funcionarios WHERE cpf = ? AND ativo = 1 LIMIT 1",
    [cpf]
  );
}

async function findByCpfForUpdate(client, cpf) {
  return getClient(client).executeOne(
    "SELECT id FROM funcionarios WHERE cpf = ? LIMIT 1 FOR UPDATE",
    [cpf]
  );
}

async function findByEmailForUpdate(client, email) {
  return getClient(client).executeOne(
    "SELECT id FROM funcionarios WHERE email = ? LIMIT 1 FOR UPDATE",
    [email]
  );
}

// Verifica se o CPF já está em uso por outro funcionário (id <> excludedEmployeeId),
// necessário na atualização para não bloquear o próprio registro como "conflito".
async function findCpfConflictForUpdate(client, cpf, excludedEmployeeId) {
  return getClient(client).executeOne(
    "SELECT id FROM funcionarios WHERE cpf = ? AND id <> ? LIMIT 1 FOR UPDATE",
    [cpf, excludedEmployeeId]
  );
}

// Mesma lógica de findCpfConflictForUpdate, mas para verificação de e-mail duplicado.
async function findEmailConflictForUpdate(client, email, excludedEmployeeId) {
  return getClient(client).executeOne(
    "SELECT id FROM funcionarios WHERE email = ? AND id <> ? LIMIT 1 FOR UPDATE",
    [email, excludedEmployeeId]
  );
}

async function countEmployees(filters = {}) {
  const { whereClause, params } = buildEmployeeFilters(filters);

  return database.executeOne(
    `SELECT COUNT(*) AS total
     FROM funcionarios f
     ${whereClause}`,
    params
  );
}

async function listEmployees({ ativo, q, limit, offset } = {}) {
  const { whereClause, params } = buildEmployeeFilters({ ativo, q });

  return database.execute(
    `${EMPLOYEE_WITH_CARGO_SELECT}
     ${whereClause}
     ORDER BY f.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

async function listForPointReport() {
  return database.execute(
    `SELECT id, nome, email, cpf, ativo, cargo_id
     FROM funcionarios
     ORDER BY nome ASC`
  );
}

async function createEmployee(
  client,
  { cpf, nome, email, senhaHash, ativo, cargoId, loginId }
) {
  // primeiro_acesso fixo em 1: todo funcionário recém-criado é obrigado a passar
  // pelo fluxo de primeiro acesso (ex: troca de senha) antes do uso normal.
  return getClient(client).execute(
    `INSERT INTO funcionarios (cpf, nome, email, senha, ativo, primeiro_acesso, cargo_id, login_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [cpf, nome, email, senhaHash, ativo ? 1 : 0, 1, cargoId, loginId]
  );
}

// Constrói a query de UPDATE dinamicamente, incluindo apenas os campos realmente
// enviados (via hasOwnProperty), permitindo atualização parcial dos dados do funcionário.
async function updateEmployee(client, employeeId, fields) {
  const columns = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(fields, "cpf")) {
    columns.push("cpf = ?");
    values.push(fields.cpf);
  }

  if (Object.prototype.hasOwnProperty.call(fields, "email")) {
    columns.push("email = ?");
    values.push(fields.email);
  }

  if (Object.prototype.hasOwnProperty.call(fields, "nome")) {
    columns.push("nome = ?");
    values.push(fields.nome);
  }

  if (Object.prototype.hasOwnProperty.call(fields, "ativo")) {
    columns.push("ativo = ?");
    values.push(fields.ativo ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(fields, "cargoId")) {
    columns.push("cargo_id = ?");
    values.push(fields.cargoId);
  }

  if (Object.prototype.hasOwnProperty.call(fields, "senhaHash")) {
    columns.push("senha = ?");
    values.push(fields.senhaHash);
  }

  // Evita executar um UPDATE sem SET (SQL inválido) quando nenhum campo é alterado.
  if (columns.length === 0) {
    return { affectedRows: 0 };
  }

  values.push(employeeId);
  return getClient(client).execute(
    `UPDATE funcionarios SET ${columns.join(", ")} WHERE id = ?`,
    values
  );
}

async function updateEmployeeStatus(employeeId, ativo) {
  return database.execute("UPDATE funcionarios SET ativo = ? WHERE id = ?", [
    ativo ? 1 : 0,
    employeeId,
  ]);
}

module.exports = {
  withTransaction,
  findById,
  findByIdForUpdate,
  findForPunchRegisterByIdForUpdate,
  findForPunchLoginByCpf,
  findForPunchLoginByEmail,
  findActiveForLegacyLoginByCpf,
  findByCpfForUpdate,
  findByEmailForUpdate,
  findCpfConflictForUpdate,
  findEmailConflictForUpdate,
  countEmployees,
  listEmployees,
  listForPointReport,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
};