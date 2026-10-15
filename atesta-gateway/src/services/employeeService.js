"use strict";

const bcrypt = require("bcrypt");
const { randomBytes } = require("node:crypto");
const env = require("../config/env");
const { logger } = require("../utils/logger");
const { formatCpf, maskCpf } = require("../utils/cpf");
const {
  BadRequestError,
  NotFoundError,
} = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");
const employeeActivationService = require("./employeeActivationService");
const employeeCreateService = require("./employeeCreateService");
const employeeReadService = require("./employeeReadService");
const loginModel = require("../models/loginModel");
const employeeEditService = require("./employeeEditService");
const { sendEmployeeWelcomeEmail } = require("./emailService");

const CARGO_TYPES = new Set(["FUNCIONARIO", "INSPETOR", "PROFESSOR"]);

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

  // O Spring cria funcionário, credencial e vínculo na mesma transação.
  // Senha temporária e hash são gerados no gateway; efeitos externos seguem aqui.
  const created = await employeeCreateService.createEmployee({
    nome,
    cpf,
    email,
    telefone,
    ativo,
    unidadeEscolarId: schoolUnitId,
    cargo: cargoSchedule.cargo,
    entrada: cargoSchedule.entrada,
    saidaAlmoco: cargoSchedule.saidaAlmoco,
    retornoAlmoco: cargoSchedule.retornoAlmoco,
    saida: cargoSchedule.saida,
    senhaHash,
  });

  await registerAuditLog({
    evento: "funcionario_cadastrado",
    adminId,
    funcionarioId: created.id,
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

async function listEmployees(query = {}, escopoUnidades = []) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  // Express 5 expõe req.query por getter; normaliza novamente na regra de negócio.
  const ativo = normalizeActiveFilter(query.ativo);
  const cargo = String(query.cargo || "").trim().toUpperCase();
  const q = String(query.q || "").trim();

  const result = await employeeReadService.listEmployees({
    ativo,
    cargo,
    q,
    page,
    limit,
  }, escopoUnidades);

  return {
    items: result.items.map(mapListedEmployee),
    pagination: result.pagination,
  };
}

async function getEmployee(employeeId, vinculoAutorizadoId) {
  if (!Number.isSafeInteger(vinculoAutorizadoId) || vinculoAutorizadoId < 1) {
    throw new NotFoundError("Funcionario nao encontrado");
  }
  const employee = await employeeReadService.findAdminEmployeeById(
    employeeId,
    vinculoAutorizadoId
  );
  if (!employee) {
    throw new NotFoundError("Funcionario nao encontrado");
  }

  return {
    funcionario: mapEditableEmployee(employee),
  };
}

async function updateEmployee(employeeId, body, { adminId, ipOrigem, vinculoAutorizado } = {}) {
  const updated = await employeeEditService.updateEmployee(employeeId, body, vinculoAutorizado);

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
  { adminId, ipOrigem, vinculoAutorizado } = {}
) {
  const expectedConfirmation = ativo ? "REATIVAR" : "DESATIVAR";
  if (confirmation !== expectedConfirmation) {
    throw new BadRequestError(
      `Confirmacao invalida. Informe ${expectedConfirmation}`
    );
  }

  const updated = await employeeActivationService.changeEmployeeActivation(
    employeeId,
    ativo,
    confirmation,
    vinculoAutorizado
  );

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
