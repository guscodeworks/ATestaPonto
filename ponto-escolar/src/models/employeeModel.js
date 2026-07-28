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

const EMPLOYEE_FILTER = Object.freeze({
  ALL: "all",
  ACTIVE: "active",
  SEARCH: "search",
  ACTIVE_SEARCH: "active_search",
});

// Cada variante e uma query completa escolhida por uma allowlist fixa.
// Nenhum fragmento recebido da requisicao e interpolado no SQL.
const COUNT_EMPLOYEE_QUERIES = Object.freeze({
  [EMPLOYEE_FILTER.ALL]:
    "SELECT COUNT(*) AS total FROM funcionarios f",
  [EMPLOYEE_FILTER.ACTIVE]:
    "SELECT COUNT(*) AS total FROM funcionarios f WHERE f.ativo = ?",
  [EMPLOYEE_FILTER.SEARCH]:
    "SELECT COUNT(*) AS total FROM funcionarios f WHERE (f.nome LIKE CONCAT('%', ?, '%') OR f.email LIKE CONCAT('%', ?, '%') OR f.cpf LIKE CONCAT('%', ?, '%'))",
  [EMPLOYEE_FILTER.ACTIVE_SEARCH]:
    "SELECT COUNT(*) AS total FROM funcionarios f WHERE f.ativo = ? AND (f.nome LIKE CONCAT('%', ?, '%') OR f.email LIKE CONCAT('%', ?, '%') OR f.cpf LIKE CONCAT('%', ?, '%'))",
});

const LIST_EMPLOYEE_QUERIES = Object.freeze({
  [EMPLOYEE_FILTER.ALL]:
    "SELECT f.id, f.cpf, f.nome, f.email, f.telefone, f.ativo, f.desativado_em, f.criado_em, f.atualizado_em, f.cargo_id, c.cargo AS cargo_nome, lf.primeiro_acesso FROM funcionarios f INNER JOIN cargos c ON c.id = f.cargo_id LEFT JOIN login_funcionario lf ON lf.funcionario_id = f.id ORDER BY f.id DESC LIMIT ? OFFSET ?",
  [EMPLOYEE_FILTER.ACTIVE]:
    "SELECT f.id, f.cpf, f.nome, f.email, f.telefone, f.ativo, f.desativado_em, f.criado_em, f.atualizado_em, f.cargo_id, c.cargo AS cargo_nome, lf.primeiro_acesso FROM funcionarios f INNER JOIN cargos c ON c.id = f.cargo_id LEFT JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.ativo = ? ORDER BY f.id DESC LIMIT ? OFFSET ?",
  [EMPLOYEE_FILTER.SEARCH]:
    "SELECT f.id, f.cpf, f.nome, f.email, f.telefone, f.ativo, f.desativado_em, f.criado_em, f.atualizado_em, f.cargo_id, c.cargo AS cargo_nome, lf.primeiro_acesso FROM funcionarios f INNER JOIN cargos c ON c.id = f.cargo_id LEFT JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE (f.nome LIKE CONCAT('%', ?, '%') OR f.email LIKE CONCAT('%', ?, '%') OR f.cpf LIKE CONCAT('%', ?, '%')) ORDER BY f.id DESC LIMIT ? OFFSET ?",
  [EMPLOYEE_FILTER.ACTIVE_SEARCH]:
    "SELECT f.id, f.cpf, f.nome, f.email, f.telefone, f.ativo, f.desativado_em, f.criado_em, f.atualizado_em, f.cargo_id, c.cargo AS cargo_nome, lf.primeiro_acesso FROM funcionarios f INNER JOIN cargos c ON c.id = f.cargo_id LEFT JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.ativo = ? AND (f.nome LIKE CONCAT('%', ?, '%') OR f.email LIKE CONCAT('%', ?, '%') OR f.cpf LIKE CONCAT('%', ?, '%')) ORDER BY f.id DESC LIMIT ? OFFSET ?",
});

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
function resolveEmployeeFilter({ ativo, q } = {}) {
  const params = [];
  const hasActiveFilter = typeof ativo === "boolean";
  const hasSearchFilter = Boolean(q);

  if (hasActiveFilter) {
    params.push(ativo ? 1 : 0);
  }

  if (hasSearchFilter) {
    params.push(q, q, q);
  }

  let key = EMPLOYEE_FILTER.ALL;
  if (hasActiveFilter && hasSearchFilter) {
    key = EMPLOYEE_FILTER.ACTIVE_SEARCH;
  } else if (hasActiveFilter) {
    key = EMPLOYEE_FILTER.ACTIVE;
  } else if (hasSearchFilter) {
    key = EMPLOYEE_FILTER.SEARCH;
  }

  return {
    key,
    params,
  };
}

async function findById(employeeId, client) {
  return getClient(client).executeOne(
    "SELECT f.id, f.cpf, f.nome, f.email, f.telefone, f.ativo, f.desativado_em, f.criado_em, f.atualizado_em, f.cargo_id, c.cargo AS cargo_nome, lf.primeiro_acesso FROM funcionarios f INNER JOIN cargos c ON c.id = f.cargo_id LEFT JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.id = ? LIMIT 1",
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
    "SELECT f.id, f.cpf, f.nome, f.email, lf.senha_hash AS senha, lf.primeiro_acesso, f.ativo FROM funcionarios f INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.cpf = ? AND (lf.senha_temporaria_expira_em IS NULL OR lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP) LIMIT 1",
    [cpf]
  );
}

async function findForPunchLoginByEmail(email) {
  return database.executeOne(
    "SELECT f.id, f.cpf, f.nome, f.email, lf.senha_hash AS senha, lf.primeiro_acesso, f.ativo FROM funcionarios f INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.email = ? AND (lf.senha_temporaria_expira_em IS NULL OR lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP) LIMIT 1",
    [email]
  );
}

// Usada no fluxo de login legado: retorna apenas funcionários ativos e inclui
// "primeiro_acesso" pois esse fluxo trata diferente o caso de troca de senha obrigatória.
async function findActiveForLegacyLoginByCpf(cpf) {
  return database.executeOne(
    "SELECT f.id, f.cpf, f.nome, lf.primeiro_acesso FROM funcionarios f INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.cpf = ? AND f.ativo = 1 LIMIT 1",
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

/**
 * Reaproveita os filtros de listagem e contagem para manter paginacao coerente.
 */
async function countEmployees(filters = {}) {
  const { key, params } = resolveEmployeeFilter(filters);

  return database.executeOne(COUNT_EMPLOYEE_QUERIES[key], params);
}

async function listEmployees({ ativo, q, limit, offset } = {}) {
  const { key, params } = resolveEmployeeFilter({ ativo, q });

  return database.execute(
    LIST_EMPLOYEE_QUERIES[key],
    [...params, Number(limit), Number(offset)]
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

async function updateEmployeeStatus(employeeId, ativo) {
  const activeValue = ativo ? 1 : 0;
  return database.execute(
    "UPDATE funcionarios SET ativo = ?, desativado_em = IF(? = 1, NULL, CURRENT_TIMESTAMP) WHERE id = ?",
    [activeValue, activeValue, employeeId]
  );
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
