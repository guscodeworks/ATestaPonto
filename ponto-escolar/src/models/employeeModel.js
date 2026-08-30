"use strict";

const database = require("../config/database");

function getClient(client) {
  return client || database;
}

async function withTransaction(callback) {
  return database.withTransaction(callback);
}

// Vínculo ATIVO mais recente por funcionário; LATERAL + LIMIT 1 evita duplicar linhas.
const ACTIVE_VINCULO_LATERAL = `
  SELECT v.cargo_id, c.cargo, v.unidade_escolar_id,
         TIME_FORMAT(v.horario_entrada, '%H:%i:%s') AS entrada,
         TIME_FORMAT(v.horario_saida_almoco, '%H:%i:%s') AS saida_almoco,
         TIME_FORMAT(v.horario_volta_almoco, '%H:%i:%s') AS retorno_almoco,
         TIME_FORMAT(v.horario_saida, '%H:%i:%s') AS saida
  FROM vinculos_funcionais v
  INNER JOIN cargos c ON c.id = v.cargo_id
  WHERE v.funcionario_id = f.id AND v.status = 'ATIVO'
  ORDER BY v.id DESC
  LIMIT 1
`;

// null representa escopo global SEDUC; [] ou valor inválido não retorna linhas.
function buildEscopoUnidadeFilter(unidadesPermitidas) {
  if (unidadesPermitidas === null) {
    return { clause: "", params: [] };
  }

  if (!Array.isArray(unidadesPermitidas)) {
    return { clause: "AND 1 = 0", params: [] };
  }

  const unitIds = [...new Set(
    unidadesPermitidas
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  if (unitIds.length === 0) {
    return { clause: "AND 1 = 0", params: [] };
  }

  const placeholders = unitIds.map(() => "?").join(",");
  return {
    clause: `AND lv.unidade_escolar_id IN (${placeholders})`,
    params: unitIds,
  };
}

// EXISTS no vínculo ativo evita inflar a contagem (sem LATERAL).
const COUNT_EMPLOYEES_QUERY =
  "SELECT COUNT(*) AS total FROM funcionarios f WHERE (? IS NULL OR f.ativo = ?) AND (? = '' OR EXISTS (SELECT 1 FROM vinculos_funcionais v INNER JOIN cargos c ON c.id = v.cargo_id WHERE v.funcionario_id = f.id AND v.status = 'ATIVO' AND c.cargo = ?)) AND (? = '' OR (f.nome LIKE CONCAT('%', ?, '%') OR f.cpf LIKE CONCAT('%', ?, '%')))";

const LIST_EMPLOYEES_QUERY =
  "SELECT f.id, f.nome, f.cpf, f.email, f.telefone, f.ativo, f.desativado_em, f.criado_em, lv.cargo_id, lv.cargo, lv.unidade_escolar_id, lv.entrada, lv.saida_almoco, lv.retorno_almoco, lv.saida FROM funcionarios f INNER JOIN LATERAL (" +
  ACTIVE_VINCULO_LATERAL +
  ") lv ON TRUE WHERE (? IS NULL OR f.ativo = ?) AND (? = '' OR lv.cargo = ?) AND (? = '' OR (f.nome LIKE CONCAT('%', ?, '%') OR f.cpf LIKE CONCAT('%', ?, '%')))";

// allowlist sem cargoId (jornada/cargo migraram para vinculos_funcionais).
const EMPLOYEE_UPDATE_ALLOWLIST = Object.freeze({
  cpf: "UPDATE funcionarios SET cpf = ? WHERE id = ?",
  email: "UPDATE funcionarios SET email = ? WHERE id = ?",
  nome: "UPDATE funcionarios SET nome = ? WHERE id = ?",
  telefone: "UPDATE funcionarios SET telefone = ? WHERE id = ?",
  ativo:
    "UPDATE funcionarios SET ativo = ?, desativado_em = IF(? = 1, NULL, CURRENT_TIMESTAMP) WHERE id = ?",
});

// Parâmetros posicionais reutilizados por contagem e listagem (mesma ordem de ?).
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
    "SELECT f.id, f.cpf, f.nome, f.email, f.telefone, f.ativo, f.desativado_em, f.criado_em, f.atualizado_em, lv.cargo_id, c.cargo AS cargo_nome, lf.primeiro_acesso FROM funcionarios f LEFT JOIN LATERAL (" +
      ACTIVE_VINCULO_LATERAL +
      ") lv ON TRUE LEFT JOIN cargos c ON c.id = lv.cargo_id LEFT JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.id = ? LIMIT 1",
    [employeeId]
  );
}

async function findAdminEmployeeById(employeeId, client) {
  return getClient(client).executeOne(
    "SELECT f.id, f.nome, f.cpf, f.email, f.telefone, lv.cargo_id, lv.cargo, lv.entrada, lv.saida_almoco, lv.retorno_almoco, lv.saida FROM funcionarios f LEFT JOIN LATERAL (" +
      ACTIVE_VINCULO_LATERAL +
      ") lv ON TRUE WHERE f.id = ? LIMIT 1",
    [employeeId]
  );
}

async function findAdminEmployeeByIdForUpdate(client, employeeId) {
  return getClient(client).executeOne(
    "SELECT f.id, f.nome, f.cpf, f.email, f.telefone, lv.cargo_id, lv.cargo, lv.entrada, lv.saida_almoco, lv.retorno_almoco, lv.saida FROM funcionarios f LEFT JOIN LATERAL (" +
      ACTIVE_VINCULO_LATERAL +
      ") lv ON TRUE WHERE f.id = ? LIMIT 1 FOR UPDATE",
    [employeeId]
  );
}

// Trava o cadastro antes de atualizar campos que afetam login/ativação.
async function findByIdForUpdate(client, employeeId) {
  return getClient(client).executeOne(
    "SELECT id, cpf, email, nome, telefone, ativo, desativado_em FROM funcionarios WHERE id = ? LIMIT 1 FOR UPDATE",
    [employeeId]
  );
}

// Trava o funcionário no registro de ponto (evita batidas concorrentes).
async function findForPunchRegisterByIdForUpdate(client, employeeId) {
  return getClient(client).executeOne(
    "SELECT id, cpf, nome, email, ativo FROM funcionarios WHERE id = ? LIMIT 1 FOR UPDATE",
    [employeeId]
  );
}

async function findForPunchDashboardById(employeeId) {
  return database.executeOne(
    "SELECT f.id, f.nome, f.ativo, lv.cargo, lv.entrada, lv.saida_almoco, lv.retorno_almoco, lv.saida FROM funcionarios f LEFT JOIN LATERAL (" +
      ACTIVE_VINCULO_LATERAL +
      ") lv ON TRUE WHERE f.id = ? LIMIT 1",
    [employeeId]
  );
}

async function findForPunchLoginByCpf(cpf) {
  // A base antiga guarda o hash em funcionarios/login. Mantemos a leitura
  // enquanto a migração completa para login_funcionario não foi executada.
  if (!(await hasModernLoginTable())) {
    return database.executeOne(
      "SELECT f.id, f.cpf, f.nome, f.email, COALESCE(l.senha, f.senha) AS senha_hash, f.primeiro_acesso, f.ativo FROM funcionarios f LEFT JOIN login l ON l.id = f.login_id WHERE f.cpf = ? AND f.ativo = 1 LIMIT 1",
      [cpf]
    );
  }

  return database.executeOne(
    "SELECT f.id, f.cpf, f.nome, f.email, lf.senha_hash, lf.primeiro_acesso, f.ativo FROM funcionarios f INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.cpf = ? AND f.ativo = 1 AND (lf.senha_temporaria_expira_em IS NULL OR lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP) LIMIT 1",
    [cpf]
  );
}

async function findForPunchLoginByEmail(email) {
  if (!(await hasModernLoginTable())) {
    return database.executeOne(
      "SELECT f.id, f.cpf, f.nome, f.email, COALESCE(l.senha, f.senha) AS senha_hash, f.primeiro_acesso, f.ativo FROM funcionarios f LEFT JOIN login l ON l.id = f.login_id WHERE f.email = ? AND f.ativo = 1 LIMIT 1",
      [email]
    );
  }

  return database.executeOne(
    "SELECT f.id, f.cpf, f.nome, f.email, lf.senha_hash, lf.primeiro_acesso, f.ativo FROM funcionarios f INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.email = ? AND f.ativo = 1 AND (lf.senha_temporaria_expira_em IS NULL OR lf.senha_temporaria_expira_em > CURRENT_TIMESTAMP) LIMIT 1",
    [email]
  );
}

async function hasModernLoginTable() {
  const table = await database.executeOne(
    "SELECT 1 AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'login_funcionario' LIMIT 1"
  );
  return Boolean(table);
}

// Dados mínimos para recuperação de senha. Aceita o schema atual e o schema
// local legado, para não bloquear quem ainda está usando a base anterior.
async function findForPasswordRecoveryByCpf(cpf) {
  if (!(await hasModernLoginTable())) {
    return database.executeOne(
      "SELECT id, nome, email, senha AS senha_hash FROM funcionarios WHERE cpf = ? AND ativo = 1 LIMIT 1",
      [cpf]
    );
  }

  return database.executeOne(
    "SELECT f.id, f.nome, f.email, lf.senha_hash FROM funcionarios f INNER JOIN login_funcionario lf ON lf.funcionario_id = f.id WHERE f.cpf = ? AND f.ativo = 1 LIMIT 1",
    [cpf]
  );
}

async function updatePasswordForRecovery(funcionarioId, senhaHash) {
  if (!(await hasModernLoginTable())) {
    return database.execute(
      "UPDATE funcionarios f LEFT JOIN login l ON l.id = f.login_id SET f.senha = ?, l.senha = ?, f.primeiro_acesso = 0, f.atualizado_em = CURRENT_TIMESTAMP WHERE f.id = ? AND f.ativo = 1",
      [senhaHash, senhaHash, funcionarioId]
    );
  }

  return database.execute(
    "UPDATE login_funcionario SET senha_hash = ?, senha_alterada_em = CURRENT_TIMESTAMP, senha_temporaria_expira_em = NULL, primeiro_acesso = FALSE WHERE funcionario_id = ?",
    [senhaHash, funcionarioId]
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

// Exclui o próprio registro (id <> excluded) para não travar a si mesmo na alteração.
async function findCpfConflictForUpdate(client, cpf, excludedEmployeeId) {
  return getClient(client).executeOne(
    "SELECT id FROM funcionarios WHERE cpf = ? AND id <> ? LIMIT 1 FOR UPDATE",
    [cpf, excludedEmployeeId]
  );
}

// Análogo a findCpfConflictForUpdate para e-mail.
async function findEmailConflictForUpdate(client, email, excludedEmployeeId) {
  return getClient(client).executeOne(
    "SELECT id FROM funcionarios WHERE email = ? AND id <> ? LIMIT 1 FOR UPDATE",
    [email, excludedEmployeeId]
  );
}

async function countEmployees(filters = {}, escopoUnidades = []) {
  const { clause, params } = buildEscopoUnidadeFilter(escopoUnidades);
  return database.executeOne(
    COUNT_EMPLOYEES_QUERY + clause,
    [...resolveEmployeeFilter(filters), ...params]
  );
}

async function listEmployees({ ativo, cargo, q, limit, offset } = {}, escopoUnidades = []) {
  const params = resolveEmployeeFilter({ ativo, cargo, q });
  const { clause, params: escopoParams } = buildEscopoUnidadeFilter(escopoUnidades);

  return database.execute(
    LIST_EMPLOYEES_QUERY + clause + " ORDER BY f.id DESC LIMIT ? OFFSET ?",
    [...params, ...escopoParams, String(Number(limit)), String(Number(offset))]
  );
}

async function listForPointReport(escopoUnidades = []) {
  const { clause, params } = buildEscopoUnidadeFilter(escopoUnidades);
  return database.execute(
    "SELECT f.id, f.nome, f.email, f.cpf, f.ativo, lv.cargo_id, lv.unidade_escolar_id FROM funcionarios f LEFT JOIN LATERAL (" +
      "SELECT v.cargo_id, v.unidade_escolar_id FROM vinculos_funcionais v WHERE v.funcionario_id = f.id AND v.status = 'ATIVO' ORDER BY v.id DESC LIMIT 1" +
      ") lv ON TRUE WHERE 1=1" + clause + " ORDER BY f.nome ASC",
    params
  );
}

// cargoId na assinatura por compat.; a associação real fica no vínculo.
async function createEmployee(
  client,
  { cargoId, cpf, email, nome, telefone = null, ativo }
) {
  void cargoId; // cargo_id migrou para vinculos_funcionais (ver employmentLinkModel).
  return getClient(client).execute(
    "INSERT INTO funcionarios (cpf, email, nome, telefone, ativo) VALUES (?, ?, ?, ?, ?)",
    [cpf, email, nome, telefone, ativo ? 1 : 0]
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

// Atualiza só as colunas fornecidas; preserva campos ausentes da requisição.
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
  findForPunchDashboardById,
  findForPunchRegisterByIdForUpdate,
  findForPunchLoginByCpf,
  findForPunchLoginByEmail,
  hasModernLoginTable,
  findForPasswordRecoveryByCpf,
  updatePasswordForRecovery,
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
