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

// Consultas fixas: filtros opcionais continuam parametrizados e nenhum valor
// recebido da requisicao e usado para montar SQL dinamicamente.
const COUNT_EMPLOYEES_QUERY =
  "SELECT COUNT(*) AS total FROM funcionarios f INNER JOIN cargos c ON f.cargo_id = c.id WHERE (? IS NULL OR f.ativo = ?) AND (? = '' OR c.cargo = ?) AND (? = '' OR (f.nome LIKE CONCAT('%', ?, '%') OR f.cpf LIKE CONCAT('%', ?, '%')))";

const LIST_EMPLOYEES_QUERY =
  "SELECT f.id, f.nome, f.cpf, f.email, f.telefone, f.ativo, f.desativado_em, f.criado_em, f.cargo_id, c.cargo, c.entrada, c.saida_almoco, c.retorno_almoco, c.saida FROM funcionarios f INNER JOIN cargos c ON f.cargo_id = c.id WHERE (? IS NULL OR f.ativo = ?) AND (? = '' OR c.cargo = ?) AND (? = '' OR (f.nome LIKE CONCAT('%', ?, '%') OR f.cpf LIKE CONCAT('%', ?, '%'))) ORDER BY f.id DESC LIMIT ? OFFSET ?";

const EMPLOYEE_UPDATE_ALLOWLIST = Object.freeze({
  cpf: "UPDATE funcionarios SET cpf = ? WHERE id = ?",
  email: "UPDATE funcionarios SET email = ? WHERE id = ?",
  nome: "UPDATE funcionarios SET nome = ? WHERE id = ?",
  telefone: "UPDATE funcionarios SET telefone = ? WHERE id = ?",
  ativo:
    "UPDATE funcionarios SET ativo = ?, desativado_em = IF(? = 1, NULL, CURRENT_TIMESTAMP) WHERE id = ?",
  cargoId: "UPDATE funcionarios SET cargo_id = ? WHERE id = ?",
});

// Monta filtros dinâmicos de forma parametrizada (evitando SQL injection) para
// serem reaproveitados tanto na contagem quanto na listagem paginada de funcionários.
function resolveEmployeeFilter({ ativo, cargo, q } = {}) {
  const activeValue = typeof ativo === "boolean" ? (ativo ? 1 : 0) : null;
  const cargoValue = String(cargo || "").trim().toUpperCase();
  const searchValue = String(q || "").trim();

  return [
    activeValue,
    activeValue,
    cargoValue,
    cargoValue,
    searchValue,
    searchValue,
    searchValue,
  ];
}

async function findById(employeeId, client) {
  return getClient(client).executeOne(
    "SELECT f.id, f.cpf, f.nome, f.email, f.telefone, f.ativo, f.desativado_em, f.criado_em, f.atualizado_em, f.cargo_id, c.cargo AS cargo_nome, lf.primeiro_acesso FROM funcionarios f INNER JOIN cargos c ON c.id = f.cargo_id LEFT JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.id = ? LIMIT 1",
    [employeeId]
  );
}

async function findAdminEmployeeById(employeeId, client) {
  return getClient(client).executeOne(
    "SELECT f.id, f.nome, f.cpf, f.email, f.telefone, f.cargo_id, c.cargo, c.entrada, c.saida_almoco, c.retorno_almoco, c.saida FROM funcionarios f INNER JOIN cargos c ON c.id = f.cargo_id WHERE f.id = ? LIMIT 1",
    [employeeId]
  );
}

async function findAdminEmployeeByIdForUpdate(client, employeeId) {
  return getClient(client).executeOne(
    "SELECT f.id, f.nome, f.cpf, f.email, f.telefone, f.cargo_id, c.cargo, c.entrada, c.saida_almoco, c.retorno_almoco, c.saida FROM funcionarios f INNER JOIN cargos c ON c.id = f.cargo_id WHERE f.id = ? LIMIT 1 FOR UPDATE",
    [employeeId]
  );
}

/**
 * Trava o cadastro antes de atualizar campos que tambem afetam login e cargo.
 */
async function findByIdForUpdate(client, employeeId) {
  return getClient(client).executeOne(
    "SELECT id, cpf, email, nome, telefone, ativo, desativado_em, cargo_id FROM funcionarios WHERE id = ? LIMIT 1 FOR UPDATE",
    [employeeId]
  );
}

/**
 * Trava o funcionario durante o registro de ponto para evitar batidas concorrentes.
 */
async function findForPunchRegisterByIdForUpdate(client, employeeId) {
  return getClient(client).executeOne(
    "SELECT id, cpf, nome, email, ativo FROM funcionarios WHERE id = ? LIMIT 1 FOR UPDATE",
    [employeeId]
  );
}

async function findForPunchLoginByCpf(cpf) {
  return database.executeOne(
    "SELECT f.id, f.cpf, f.nome, f.email, lf.senha_hash, lf.primeiro_acesso, f.ativo FROM funcionarios f INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.cpf = ? AND f.ativo = 1 AND (lf.senha_temporaria_expira_em IS NULL OR lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP) LIMIT 1",
    [cpf]
  );
}

async function findForPunchLoginByEmail(email) {
  return database.executeOne(
    "SELECT f.id, f.cpf, f.nome, f.email, lf.senha_hash, lf.primeiro_acesso, f.ativo FROM funcionarios f INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.email = ? AND f.ativo = 1 AND (lf.senha_temporaria_expira_em IS NULL OR lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP) LIMIT 1",
    [email]
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

/**
 * Reaproveita os filtros de listagem e contagem para manter paginacao coerente.
 */
async function countEmployees(filters = {}) {
  return database.executeOne(
    COUNT_EMPLOYEES_QUERY,
    resolveEmployeeFilter(filters)
  );
}

async function listEmployees({ ativo, cargo, q, limit, offset } = {}) {
  const params = resolveEmployeeFilter({ ativo, cargo, q });

  return database.execute(
    LIST_EMPLOYEES_QUERY,
    [...params, String(Number(limit)), String(Number(offset))]
  );
}

async function listForPointReport() {
  return database.execute(
    "SELECT id, nome, email, cpf, ativo, cargo_id FROM funcionarios ORDER BY nome ASC",
    []
  );
}

async function createEmployee(
  client,
  { cargoId, cpf, email, nome, telefone = null, ativo }
) {
  return getClient(client).execute(
    "INSERT INTO funcionarios (cargo_id, cpf, email, nome, telefone, ativo) VALUES (?, ?, ?, ?, ?, ?)",
    [cargoId, cpf, email, nome, telefone, ativo ? 1 : 0]
  );
}

async function updateAdminEmployee(
  client,
  employeeId,
  { nome, email, telefone }
) {
  return getClient(client).execute(
    "UPDATE funcionarios SET nome = ?, email = ?, telefone = ? WHERE id = ?",
    [nome, email, telefone, employeeId]
  );
}

/**
 * Monta somente as colunas alteradas para preservar campos fora da requisicao.
 */
async function updateEmployee(client, employeeId, fields) {
  let lastResult = { affectedRows: 0 };
  let totalAffectedRows = 0;

  for (const field of Object.keys(EMPLOYEE_UPDATE_ALLOWLIST)) {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) {
      continue;
    }

    const query = EMPLOYEE_UPDATE_ALLOWLIST[field];
    if (field === "ativo") {
      const activeValue = fields.ativo ? 1 : 0;
      lastResult = await getClient(client).execute(query, [
        activeValue,
        activeValue,
        employeeId,
      ]);
      totalAffectedRows += Number(lastResult.affectedRows || 0);
      continue;
    }

    lastResult = await getClient(client).execute(query, [
      fields[field],
      employeeId,
    ]);
    totalAffectedRows += Number(lastResult.affectedRows || 0);
  }

  return {
    ...lastResult,
    affectedRows: totalAffectedRows,
  };
}

async function updateEmployeeActivation(client, employeeId, ativo) {
  const activeValue = ativo ? 1 : 0;
  return getClient(client).execute(
    "UPDATE funcionarios SET ativo = ?, desativado_em = IF(? = 1, NULL, CURRENT_TIMESTAMP) WHERE id = ?",
    [activeValue, activeValue, employeeId]
  );
}

async function findEmployeeActivationById(client, employeeId) {
  return getClient(client).executeOne(
    "SELECT id, ativo, desativado_em FROM funcionarios WHERE id = ? LIMIT 1",
    [employeeId]
  );
}

module.exports = {
  withTransaction,
  findById,
  findAdminEmployeeById,
  findAdminEmployeeByIdForUpdate,
  findByIdForUpdate,
  findForPunchRegisterByIdForUpdate,
  findForPunchLoginByCpf,
  findForPunchLoginByEmail,
  findByCpfForUpdate,
  findByEmailForUpdate,
  findCpfConflictForUpdate,
  findEmailConflictForUpdate,
  countEmployees,
  listEmployees,
  listForPointReport,
  createEmployee,
  updateAdminEmployee,
  updateEmployee,
  updateEmployeeActivation,
  findEmployeeActivationById,
};
