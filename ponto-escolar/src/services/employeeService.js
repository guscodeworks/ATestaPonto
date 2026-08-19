"use strict";

const bcrypt = require("bcrypt");
const { randomBytes } = require("node:crypto");
const env = require("../config/env");
const { logger } = require("../utils/logger");
const { formatCpf, maskCpf } = require("../utils/cpf");
const {
  BadRequestError,
  ConflictError,
  NotFoundError,
} = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");
const employeeModel = require("../models/employeeModel");
const loginModel = require("../models/loginModel");
const roleModel = require("../models/roleModel");
const employmentLinkModel = require("../models/employmentLinkModel");
const schoolUnitModel = require("../models/schoolUnitModel");
const { sendEmployeeWelcomeEmail } = require("./emailService");

const CARGO_TYPES = new Set(["FUNCIONARIO", "INSPETOR", "PROFESSOR"]);

// Edição aceita o mesmo conjunto do cadastro.
const EDITABLE_CARGO_TYPES = CARGO_TYPES;
const EDITABLE_EMPLOYEE_FIELDS = new Set([
  "nome",
  "email",
  "telefone",
  "cargo",
  "entrada",
  "saida_almoco",
  "retorno_almoco",
  "saida",
]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

// CPF mascarado na saída; só usado internamente para lógica.
function mapEmployee(employee) {
  return {
    id: employee.id,
    cpf: maskCpf(employee.cpf),
    nome: employee.nome,
    email: employee.email,
    telefone: employee.telefone || null,
    ativo: Boolean(employee.ativo),
    criado_em: employee.criado_em,
    primeiro_acesso: Boolean(employee.primeiro_acesso),
    cargo_id: employee.cargo_id ? Number(employee.cargo_id) : null,
    cargo_nome: employee.cargo_nome ? String(employee.cargo_nome) : null,
  };
}

function mapListedEmployee(employee) {
  return {
    id: Number(employee.id),
    nome: employee.nome,
    cpf: maskCpf(employee.cpf),
    email: employee.email,
    telefone: employee.telefone || null,
    ativo: Boolean(employee.ativo),
    desativado_em: employee.desativado_em || null,
    criado_em: employee.criado_em,
    cargo_id: employee.cargo_id ? Number(employee.cargo_id) : null,
    cargo: employee.cargo ? String(employee.cargo) : null,
    entrada: employee.entrada ? String(employee.entrada) : null,
    saida_almoco: employee.saida_almoco ? String(employee.saida_almoco) : null,
    retorno_almoco: employee.retorno_almoco ? String(employee.retorno_almoco) : null,
    saida: employee.saida ? String(employee.saida) : null,
  };
}

function mapEditableEmployee(employee) {
  return {
    id: Number(employee.id),
    nome: employee.nome,
    cpf: formatCpf(employee.cpf),
    email: employee.email,
    telefone: employee.telefone || null,
    cargo: employee.cargo ? String(employee.cargo) : null,
    entrada: employee.entrada ? String(employee.entrada) : null,
    saida_almoco: employee.saida_almoco ? String(employee.saida_almoco) : null,
    retorno_almoco: employee.retorno_almoco ? String(employee.retorno_almoco) : null,
    saida: employee.saida ? String(employee.saida) : null,
  };
}

function normalizeActiveFilter(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return value === true || value === 1 || value === "true" || value === "1";
}

function readCargoSchedule(body = {}) {
  const fieldNames = [
    "cargo",
    "entrada",
    "saida_almoco",
    "retorno_almoco",
    "saida",
  ];
  const hasAnyScheduleField = fieldNames.some(
    (field) => body[field] !== undefined
  );

  if (!hasAnyScheduleField) {
    throw new BadRequestError("cargo e horarios sao obrigatorios");
  }

  const cargo = String(body.cargo || "").trim().toUpperCase();
  const times = {
    entrada: String(body.entrada || "").trim(),
    saidaAlmoco: String(body.saida_almoco || "").trim(),
    retornoAlmoco: String(body.retorno_almoco || "").trim(),
    saida: String(body.saida || "").trim(),
  };

  if (!CARGO_TYPES.has(cargo)) {
    throw new BadRequestError("cargo invalido");
  }

  if (Object.values(times).some((time) => !TIME_PATTERN.test(time))) {
    throw new BadRequestError("Horarios do cargo invalidos");
  }

  const timeToSeconds = (time) => {
    const [hours, minutes, seconds = "0"] = time.split(":");
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  };
  const orderedTimes = [
    times.entrada,
    times.saidaAlmoco,
    times.retornoAlmoco,
    times.saida,
  ].map(timeToSeconds);
  if (
    !orderedTimes.every(
      (time, index) => index === 0 || orderedTimes[index - 1] < time
    )
  ) {
    throw new BadRequestError(
      "Horarios devem seguir entrada < saida_almoco < retorno_almoco < saida"
    );
  }

  return {
    cargo,
    entrada: times.entrada.length === 5 ? `${times.entrada}:00` : times.entrada,
    saidaAlmoco:
      times.saidaAlmoco.length === 5
        ? `${times.saidaAlmoco}:00`
        : times.saidaAlmoco,
    retornoAlmoco:
      times.retornoAlmoco.length === 5
        ? `${times.retornoAlmoco}:00`
        : times.retornoAlmoco,
    saida: times.saida.length === 5 ? `${times.saida}:00` : times.saida,
  };
}

function generateTemporaryPassword() {
  return randomBytes(18).toString("base64url");
}

// Unidade obrigatória (vínculo exige + geolocalização do ponto vem dela).
// Existência é confirmada na transação, não aqui.
function normalizeUnidadeEscolarId(value) {
  if (value === undefined || value === null || value === "") {
    throw new BadRequestError("unidade_escolar_id e obrigatorio");
  }

  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new BadRequestError("unidade_escolar_id invalido");
  }

  return id;
}

// `cargo` é UNIQUE/compartilhada: reutiliza o row existente. Roda na transação
// com FOR UPDATE p/ que dois cadastros concorrentes do mesmo cargo sejam determinísticos.
async function findOrCreateCargo(client, cargo) {
  const existing = await roleModel.findByNomeForUpdate(client, cargo);
  if (existing) {
    return Number(existing.id);
  }

  const insert = await roleModel.createCargo(client, { cargo });
  const cargoId = Number(insert.insertId);
  if (!Number.isInteger(cargoId) || cargoId < 1) {
    throw new Error("Falha ao obter o ID do cargo criado");
  }
  return cargoId;
}

// Cria funcionário + login juntos: evita credencial sem cadastro ativo.
async function createEmployee(body, { adminId, ipOrigem } = {}) {
  const nome = String(body.nome || "").trim();
  const cpf = String(body.cpf || "").trim();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const telefone = String(body.telefone || "").replace(/\D/g, "") || null;
  const ativo = body.ativo === undefined ? true : Boolean(body.ativo);
  const cargoSchedule = readCargoSchedule(body);
  if (Object.prototype.hasOwnProperty.call(body, "cargo_id")) {
    throw new BadRequestError("cargo_id nao e aceito no cadastro de funcionario");
  }
  const schoolUnitId = normalizeUnidadeEscolarId(body.unidade_escolar_id);
  const senhaTemporaria = generateTemporaryPassword();
  const senhaHash = await bcrypt.hash(
    senhaTemporaria,
    env.BCRYPT_SALT_ROUNDS
  );

  // Transação cobre duplicidade, cargo, login e funcionário como uma unidade.
  const createdIds = await employeeModel.withTransaction(async (tx) => {
    const cpfExists = await employeeModel.findByCpfForUpdate(tx, cpf);
    if (cpfExists?.id) {
      throw new ConflictError("CPF ja cadastrado");
    }

    const emailExists = await employeeModel.findByEmailForUpdate(tx, email);
    if (emailExists?.id) {
      throw new ConflictError("Email ja cadastrado");
    }

    // unidade obrigatória: confirma existência p/ falhar cedo com msg de negócio
    // em vez de estourar a FK no INSERT do vínculo.
    const unidade = await schoolUnitModel.findByIdForUpdate(
      tx,
      schoolUnitId
    );
    if (!unidade) {
      throw new NotFoundError("Unidade escolar nao encontrada");
    }

    // cargo: reutiliza o row existente ou cria um novo (UNIQUE/compartilhada).
    const cargoId = await findOrCreateCargo(tx, cargoSchedule.cargo);

    const result = await employeeModel.createEmployee(tx, {
      cpf,
      nome,
      email,
      telefone,
      ativo,
      cargoId,
    });
    const funcionarioId = Number(result.insertId);
    if (!Number.isInteger(funcionarioId) || funcionarioId < 1) {
      throw new Error("Falha ao obter o ID do funcionario criado");
    }

    await loginModel.createLogin(tx, { funcionarioId, senhaHash });
    // Vínculo na mesma transação; rollback desfaz funcionário, login e cargo juntos.
    await employmentLinkModel.createVinculo(tx, {
      funcionarioId,
      schoolUnitId,
      cargoId,
      entrada: cargoSchedule.entrada,
      saidaAlmoco: cargoSchedule.saidaAlmoco,
      retornoAlmoco: cargoSchedule.retornoAlmoco,
      saida: cargoSchedule.saida,
    });

    return { funcionarioId, cargoId };
  });

  let created;
  try {
    created = await employeeModel.findById(createdIds.funcionarioId);
  } catch (error) {
    logger.warn("Cadastro concluido, mas a leitura complementar falhou", {
      error,
      funcionarioId: createdIds.funcionarioId,
    });
  }

  if (!created) {
    created = {
      id: createdIds.funcionarioId,
      cpf,
      nome,
      email,
      telefone,
      ativo,
      criado_em: null,
      primeiro_acesso: true,
      cargo_id: createdIds.cargoId,
      cargo_nome: cargoSchedule.cargo,
    };
  }

  await registerAuditLog({
    evento: "funcionario_cadastrado",
    adminId,
    funcionarioId: createdIds.funcionarioId,
    mensagem: "Cadastro de funcionario realizado",
    ipOrigem,
    metadados: {
      cpf: created.cpf,
      email: created.email,
      cargo_id: created.cargo_id,
    },
  });

  // E-mail só após a transação; falhas de SMTP não desfazem o cadastro já confirmado.
  const entregaEmail = await sendEmployeeWelcomeEmail({
    nome: created.nome,
    email: created.email,
    senhaTemporaria,
  });

  return {
    funcionario: mapEmployee(created),
    email_acesso: entregaEmail,
  };
}

async function listEmployees(query = {}, escopoUnidades = null) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const offset = (page - 1) * limit;
  // Express 5 expõe req.query por getter; normaliza novamente na regra de negócio.
  const ativo = normalizeActiveFilter(query.ativo);
  const cargo = String(query.cargo || "").trim().toUpperCase();
  const q = String(query.q || "").trim();

  const totalRows = await employeeModel.countEmployees({ ativo, cargo, q }, escopoUnidades);
  const employees = await employeeModel.listEmployees({
    ativo,
    cargo,
    q,
    limit,
    offset,
  }, escopoUnidades);

  return {
    items: employees.map(mapListedEmployee),
    pagination: {
      page,
      limit,
      total: Number(totalRows?.total || 0),
    },
  };
}

async function getEmployee(employeeId) {
  const employee = await employeeModel.findAdminEmployeeById(employeeId);
  if (!employee) {
    throw new NotFoundError("Funcionario nao encontrado");
  }

  return {
    funcionario: mapEditableEmployee(employee),
  };
}

function resolveEditableEmployee(body, existing) {
  const fields = Object.keys(body || {});
  if (
    fields.length === 0 ||
    fields.some((field) => !EDITABLE_EMPLOYEE_FIELDS.has(field))
  ) {
    throw new BadRequestError("Campos de atualizacao invalidos");
  }

  const cargo = String(
    body.cargo !== undefined ? body.cargo : existing.cargo
  )
    .trim()
    .toUpperCase();
  if (!EDITABLE_CARGO_TYPES.has(cargo)) {
    throw new BadRequestError("cargo invalido");
  }

  const sourceTimes = {
    entrada: body.entrada !== undefined ? body.entrada : existing.entrada,
    saidaAlmoco:
      body.saida_almoco !== undefined
        ? body.saida_almoco
        : existing.saida_almoco,
    retornoAlmoco:
      body.retorno_almoco !== undefined
        ? body.retorno_almoco
        : existing.retorno_almoco,
    saida: body.saida !== undefined ? body.saida : existing.saida,
  };
  const times = Object.fromEntries(
    Object.entries(sourceTimes).map(([field, value]) => [
      field,
      String(value || "").trim(),
    ])
  );

  if (Object.values(times).some((time) => !TIME_PATTERN.test(time))) {
    throw new BadRequestError("Horarios do cargo invalidos");
  }

  const orderedTimes = [
    times.entrada,
    times.saidaAlmoco,
    times.retornoAlmoco,
    times.saida,
  ].map((time) => {
    const [hours, minutes, seconds = "0"] = time.split(":");
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  });
  if (
    !orderedTimes.every(
      (time, index) => index === 0 || orderedTimes[index - 1] < time
    )
  ) {
    throw new BadRequestError(
      "Horarios devem seguir entrada < saida_almoco < retorno_almoco < saida"
    );
  }

  const toDatabaseTime = (time) => (time.length === 5 ? `${time}:00` : time);
  return {
    nome:
      body.nome !== undefined
        ? String(body.nome).trim()
        : String(existing.nome),
    email:
      body.email !== undefined
        ? String(body.email).trim().toLowerCase()
        : String(existing.email).trim().toLowerCase(),
    telefone:
      body.telefone !== undefined
        ? String(body.telefone || "").replace(/\D/g, "") || null
        : existing.telefone || null,
    cargoSchedule: {
      cargo,
      entrada: toDatabaseTime(times.entrada),
      saidaAlmoco: toDatabaseTime(times.saidaAlmoco),
      retornoAlmoco: toDatabaseTime(times.retornoAlmoco),
      saida: toDatabaseTime(times.saida),
    },
  };
}

/**
 * Atualiza o funcionario e seu cargo exclusivo como uma unica operacao atomica.
 */
async function updateEmployee(employeeId, body, { adminId, ipOrigem } = {}) {
  const updated = await employeeModel.withTransaction(async (tx) => {
    const existing = await employeeModel.findAdminEmployeeByIdForUpdate(
      tx,
      employeeId
    );
    if (!existing) {
      throw new NotFoundError("Funcionario nao encontrado");
    }

    // Jornada/cargo vivem no vínculo ativo (cargos é UNIQUE/compartilhada, não
    // por funcionário). Sem vínculo ativo não há onde editar a jornada. Nunca
    // renomeia o row de cargos (afetaria outros funcionários) — re-aponta o
    // vínculo p/ o cargo-alvo (find-or-create pelo nome).
    const vinculo = await employmentLinkModel.findActiveByFuncionarioIdForUpdate(
      tx,
      employeeId
    );
    if (!vinculo) {
      throw new ConflictError("Funcionario sem vinculo ativo para editar");
    }

    const edits = resolveEditableEmployee(body, existing);
    const emailExists = await employeeModel.findEmailConflictForUpdate(
      tx,
      edits.email,
      employeeId
    );
    if (emailExists) {
      throw new ConflictError("Email ja cadastrado");
    }

    // Sem guard em affectedRows: o UPDATE do mysql2 devolve linhas ALTERADAS (não
    // "matched"), então uma edição no-op (jornada repetida) daria 0 → falso "não encontrado".
    await employeeModel.updateAdminEmployee(tx, employeeId, edits);

    // Re-aponta o vínculo ao cargo-alvo (find-or-create pelo nome) e sobrescreve a jornada.
    const cargoId = await findOrCreateCargo(tx, edits.cargoSchedule.cargo);
    await employmentLinkModel.update(tx, vinculo.id, {
      cargoId,
      entrada: edits.cargoSchedule.entrada,
      saidaAlmoco: edits.cargoSchedule.saidaAlmoco,
      retornoAlmoco: edits.cargoSchedule.retornoAlmoco,
      saida: edits.cargoSchedule.saida,
    });

    return {
      ...existing,
      cargo_id: cargoId,
      nome: edits.nome,
      email: edits.email,
      telefone: edits.telefone,
      cargo: edits.cargoSchedule.cargo,
      entrada: edits.cargoSchedule.entrada,
      saida_almoco: edits.cargoSchedule.saidaAlmoco,
      retorno_almoco: edits.cargoSchedule.retornoAlmoco,
      saida: edits.cargoSchedule.saida,
    };
  });

  await registerAuditLog({
    evento: "funcionario_alterado",
    adminId,
    funcionarioId: employeeId,
    mensagem: "Dados de funcionario alterados",
    ipOrigem,
    metadados: {
      email: updated.email,
      cargo_id: updated.cargo_id,
    },
  });

  return {
    funcionario: mapEditableEmployee(updated),
  };
}

async function changeEmployeeActivation(
  employeeId,
  ativo,
  confirmation,
  { adminId, ipOrigem } = {}
) {
  const expectedConfirmation = ativo ? "REATIVAR" : "DESATIVAR";
  if (confirmation !== expectedConfirmation) {
    throw new BadRequestError(
      `Confirmacao invalida. Informe ${expectedConfirmation}`
    );
  }

  const updated = await employeeModel.withTransaction(async (tx) => {
    const existing = await employeeModel.findByIdForUpdate(tx, employeeId);
    if (!existing) {
      throw new NotFoundError("Funcionario nao encontrado");
    }

    if (Boolean(existing.ativo) === ativo) {
      throw new ConflictError(
        ativo
          ? "Funcionario ja esta ativo"
          : "Funcionario ja esta inativo"
      );
    }

    const result = await employeeModel.updateEmployeeActivation(
      tx,
      employeeId,
      ativo
    );
    if (!result.affectedRows) {
      throw new Error("Falha ao atualizar o status do funcionario");
    }

    // Desativar encerra o vínculo ativo (cargo/escola/jornada vive nele); não
    // apaga pontos (histórico intacto). Reativar NÃO (re)abre vínculo — isso é
    // operação de cadastro separada.
    if (!ativo) {
      const vinculo = await employmentLinkModel.findActiveByFuncionarioIdForUpdate(
        tx,
        employeeId
      );
      if (vinculo) {
        await employmentLinkModel.encerrarVinculo(tx, vinculo.id);
      }
    }

    const status = await employeeModel.findEmployeeActivationById(
      tx,
      employeeId
    );
    if (!status) {
      throw new Error("Falha ao consultar o status atualizado do funcionario");
    }

    return status;
  });

  await registerAuditLog({
    evento: ativo ? "funcionario_ativado" : "funcionario_desativado",
    adminId,
    funcionarioId: employeeId,
    mensagem: ativo ? "Funcionario ativado" : "Funcionario desativado",
    ipOrigem,
  });

  return {
    id: Number(updated.id),
    ativo: Boolean(updated.ativo),
    desativado_em: updated.desativado_em || null,
  };
}

async function deactivateEmployee(employeeId, confirmation, auditContext) {
  return changeEmployeeActivation(
    employeeId,
    false,
    confirmation,
    auditContext
  );
}

async function reactivateEmployee(employeeId, confirmation, auditContext) {
  return changeEmployeeActivation(
    employeeId,
    true,
    confirmation,
    auditContext
  );
}

module.exports = {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  deactivateEmployee,
  reactivateEmployee,
};
