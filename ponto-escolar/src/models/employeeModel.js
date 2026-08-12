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

// NOVO SCHEMA: `funcionarios` não tem mais `cargo_id` nem `unidade_escolar_id`.
// Cargo, unidade escolar e jornada (horários) passaram a residir em
// `vinculos_funcionais`. Os métodos públicos preservam o shape que os Services
// já esperam (cargo_id, cargo, entrada, saida_almoco, retorno_almoco, saida),
// agora resolvidos via JOIN lateral no vínculo ATIVO. Isso evita duplicar linhas
// quando um funcionário possui múltiplos vínculos (LIMIT 1 dentro do LATERAL).

// Trecho SQL reutilizável: jornada atual do funcionário (vínculo mais recente,
// preferindo o ATIVO). Retorna no máximo 1 linha por funcionário (sem multiplicar).
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

// Monta cláusula extra de WHERE + params para filtrar funcionários pelo
// conjunto de unidades permitidas ao escopo do admin. `unidadesPermitidas`
// null/undefined/vazio => sem restrição (SEDUC ou serviço fora de escopo).
// Essa camada não conhece perfis: recebe apenas ids numéricos.
function buildEscopoUnidadeFilter(unidadesPermitidas) {
  if (!Array.isArray(unidadesPermitidas) || unidadesPermitidas.length === 0) {
    return { clause: "", params: [] };
  }

  const placeholders = unidadesPermitidas.map(() => "?").join(",");
  return {
    clause: `AND lv.unidade_escolar_id IN (${placeholders})`,
    params: unidadesPermitidas.map((id) => Number(id)),
  };
}

// Consultas fixas: filtros opcionais continuam parametrizados e nenhum valor
// recebido da requisicao e usado para montar SQL dinamicamente. O filtro por cargo
// agora é satisfeito pelo vínculo ativo (EXISTS), mantendo a contagem sem inflar
// mesmo se houver mais de um vínculo por funcionário.
const COUNT_EMPLOYEES_QUERY =
  "SELECT COUNT(*) AS total FROM funcionarios f WHERE (? IS NULL OR f.ativo = ?) AND (? = '' OR EXISTS (SELECT 1 FROM vinculos_funcionais v INNER JOIN cargos c ON c.id = v.cargo_id WHERE v.funcionario_id = f.id AND v.status = 'ATIVO' AND c.cargo = ?)) AND (? = '' OR (f.nome LIKE CONCAT('%', ?, '%') OR f.cpf LIKE CONCAT('%', ?, '%')))";

const LIST_EMPLOYEES_QUERY =
  "SELECT f.id, f.nome, f.cpf, f.email, f.telefone, f.ativo, f.desativado_em, f.criado_em, lv.cargo_id, lv.cargo, lv.unidade_escolar_id, lv.entrada, lv.saida_almoco, lv.retorno_almoco, lv.saida FROM funcionarios f INNER JOIN LATERAL (" +
  ACTIVE_VINCULO_LATERAL +
  ") lv ON TRUE WHERE (? IS NULL OR f.ativo = ?) AND (? = '' OR lv.cargo = ?) AND (? = '' OR (f.nome LIKE CONCAT('%', ?, '%') OR f.cpf LIKE CONCAT('%', ?, '%')))";

// Cargo não é mais coluna de funcionarios: a allowlist de campos editáveis do
// funcionário perdeu a entrada `cargoId` (atualizar cargo/enviarcargo_id direto em
// `funcionarios` jamais faria sentido no novo schema). A edição de jornada migra
// para o vínculo (fora deste Model).
const EMPLOYEE_UPDATE_ALLOWLIST = Object.freeze({
  cpf: "UPDATE funcionarios SET cpf = ? WHERE id = ?",
  email: "UPDATE funcionarios SET email = ? WHERE id = ?",
  nome: "UPDATE funcionarios SET nome = ? WHERE id = ?",
  telefone: "UPDATE funcionarios SET telefone = ? WHERE id = ?",
  ativo:
    "UPDATE funcionarios SET ativo = ?, desativado_em = IF(? = 1, NULL, CURRENT_TIMESTAMP) WHERE id = ?",
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

/**
 * Trava o cadastro antes de atualizar campos que tambem afetam login e ativação.
 * (Cargo não faz mais parte do cadastro do funcionário: vínculo cuida disso.)
 */
async function findByIdForUpdate(client, employeeId) {
  return getClient(client).executeOne(
    "SELECT id, cpf, email, nome, telefone, ativo, desativado_em FROM funcionarios WHERE id = ? LIMIT 1 FOR UPDATE",
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

async function findForPunchDashboardById(employeeId) {
  return database.executeOne(
    "SELECT f.id, f.nome, f.ativo, lv.cargo, lv.entrada, lv.saida_almoco, lv.retorno_almoco, lv.saida FROM funcionarios f LEFT JOIN LATERAL (" +
      ACTIVE_VINCULO_LATERAL +
      ") lv ON TRUE WHERE f.id = ? LIMIT 1",
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
async function countEmployees(filters = {}, escopoUnidades = null) {
  const { clause, params } = buildEscopoUnidadeFilter(escopoUnidades);
  return database.executeOne(
    COUNT_EMPLOYEES_QUERY + clause,
    [...resolveEmployeeFilter(filters), ...params]
  );
}

async function listEmployees({ ativo, cargo, q, limit, offset } = {}, escopoUnidades = null) {
  const params = resolveEmployeeFilter({ ativo, cargo, q });
  const { clause, params: escopoParams } = buildEscopoUnidadeFilter(escopoUnidades);

  return database.execute(
    LIST_EMPLOYEES_QUERY + clause + " ORDER BY f.id DESC LIMIT ? OFFSET ?",
    [...params, ...escopoParams, String(Number(limit)), String(Number(offset))]
  );
}

async function listForPointReport(escopoUnidades = null) {
  // Mesma noção de "cargo atual" das demais leituras admin: somente o vínculo
  // ATIVO (LEFT JOIN LATERAL com filtro de status). Antes pegava o vínculo mais
  // recente independente de status, podendo mostrar cargo de vínculo
  // AFASTADO/ENCERRADO — inconsistente com listEmployees/findAdminEmployeeById.
  const { clause, params } = buildEscopoUnidadeFilter(escopoUnidades);
  return database.execute(
    "SELECT f.id, f.nome, f.email, f.cpf, f.ativo, lv.cargo_id, lv.unidade_escolar_id FROM funcionarios f LEFT JOIN LATERAL (" +
      "SELECT v.cargo_id, v.unidade_escolar_id FROM vinculos_funcionais v WHERE v.funcionario_id = f.id AND v.status = 'ATIVO' ORDER BY v.id DESC LIMIT 1" +
      ") lv ON TRUE WHERE 1=1" + clause + " ORDER BY f.nome ASC",
    params
  );
}

// cargoId aceito por compatibilidade com o Service, mas no novo schema ele não
// pertence à tabela funcionarios: a associação cargo↔funcionário vive no vínculo.
async function createEmployee(
  client,
  { cargoId, cpf, email, nome, telefone = null, ativo }
) {
  void cargoId; // cargo_id migrated to vinculos_funcionais (see vinculoModel).
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
  findForPunchDashboardById,
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
