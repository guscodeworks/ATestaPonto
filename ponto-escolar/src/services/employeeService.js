"use strict";

const bcrypt = require("bcrypt");
const { randomBytes } = require("node:crypto");
const env = require("../config/env");
const { logger } = require("../utils/logger");
const { maskCpf } = require("../utils/cpf");
const {
  BadRequestError,
  ConflictError,
  NotFoundError,
} = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");
const employeeModel = require("../models/employeeModel");
const loginModel = require("../models/loginModel");
const cargoModel = require("../models/cargoModel");

const CARGO_TYPES = new Set(["FUNCIONARIO", "INSPETOR", "PROFESSOR"]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

// CPF sempre mascarado ao sair da API, evitando expor o dado completo em
// respostas/listagens (o valor completo só é usado internamente para lógica).
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

async function resolveCargo(tx, requestedCargoId) {
  const cargo = await cargoModel.findByIdForUpdate(tx, requestedCargoId);
  if (!cargo?.id) {
    throw new BadRequestError("cargo_id informado nao existe");
  }
  return {
    id: Number(cargo.id),
    cargo: String(cargo.cargo),
    entrada: String(cargo.entrada),
    saidaAlmoco: String(cargo.saida_almoco),
    retornoAlmoco: String(cargo.retorno_almoco),
    saida: String(cargo.saida),
  };
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

/**
 * Cria funcionario e login juntos para evitar credencial sem cadastro ativo.
 */
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
  const senhaTemporaria = generateTemporaryPassword();
  const senhaHash = await bcrypt.hash(
    senhaTemporaria,
    env.BCRYPT_SALT_ROUNDS
  );

  // A transacao cobre duplicidade, cargo, login e funcionario como uma unica regra.
  const createdIds = await employeeModel.withTransaction(async (tx) => {
    const cpfExists = await employeeModel.findByCpfForUpdate(tx, cpf);
    if (cpfExists?.id) {
      throw new ConflictError("CPF ja cadastrado");
    }

    const emailExists = await employeeModel.findByEmailForUpdate(tx, email);
    if (emailExists?.id) {
      throw new ConflictError("Email ja cadastrado");
    }

    const cargoInsert = await cargoModel.createCargo(tx, cargoSchedule);
    const cargoId = Number(cargoInsert.insertId);
    if (!Number.isInteger(cargoId) || cargoId < 1) {
      throw new Error("Falha ao obter o ID do cargo criado");
    }

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

  return {
    funcionario: mapEmployee(created),
    senha_temporaria: senhaTemporaria,
  };
}

async function listEmployees(query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const offset = (page - 1) * limit;
  const ativo = query.ativo;
  const q = String(query.q || "").trim();

  const totalRows = await employeeModel.countEmployees({ ativo, q });
  const employees = await employeeModel.listEmployees({
    ativo,
    q,
    limit,
    offset,
  });

  return {
    items: employees.map(mapEmployee),
    pagination: {
      page,
      limit,
      total: Number(totalRows?.total || 0),
    },
  };
}

/**
 * Atualiza dados do funcionario e credenciais sem separar o login do cadastro.
 */
async function updateEmployee(employeeId, body, { adminId, ipOrigem } = {}) {
  const nome = body.nome;
  const cpf = body.cpf;
  const email = body.email;
  const senha = body.senha;
  const ativo = body.ativo;
  const cargoId = body.cargo_id;

  // Atualização é parcial (PATCH): ao menos um campo precisa ter sido enviado,
  // senão a requisição não teria efeito algum.
  const hasAnyField =
    nome !== undefined ||
    cpf !== undefined ||
    email !== undefined ||
    senha !== undefined ||
    ativo !== undefined ||
    cargoId !== undefined;

  if (!hasAnyField) {
    throw new BadRequestError("Nenhum campo para atualizar foi enviado");
  }

  // Toda a validação de conflito + atualização roda em transação, com os
  // registros bloqueados via FOR UPDATE (findByIdForUpdate, findCpfConflictForUpdate
  // etc.), evitando que duas requisições concorrentes criem uma duplicidade de
  // CPF/email que passaria despercebida se as checagens fossem feitas fora da transação.
  await employeeModel.withTransaction(async (tx) => {
    const existing = await employeeModel.findByIdForUpdate(tx, employeeId);
    if (!existing) {
      throw new NotFoundError("Funcionario nao encontrado");
    }

    const fields = {};

    if (cpf !== undefined) {
      const normalizedCpf = String(cpf).trim();
      // Só verifica conflito de CPF se o valor realmente mudou, evitando que o
      // próprio funcionário conflite consigo mesmo ao reenviar o mesmo CPF.
      if (normalizedCpf !== existing.cpf) {
        const cpfExists = await employeeModel.findCpfConflictForUpdate(
          tx,
          normalizedCpf,
          employeeId
        );
        if (cpfExists) {
          throw new ConflictError("CPF ja cadastrado");
        }

        fields.cpf = normalizedCpf;
      }
    }

    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (normalizedEmail !== String(existing.email || "").toLowerCase()) {
        const emailExists = await employeeModel.findEmailConflictForUpdate(
          tx,
          normalizedEmail,
          employeeId
        );
        if (emailExists) {
          throw new ConflictError("Email ja cadastrado");
        }
      }
      fields.email = normalizedEmail;
    }

    if (nome !== undefined) {
      fields.nome = String(nome).trim();
    }

    if (ativo !== undefined) {
      fields.ativo = ativo ? 1 : 0;
    }

    if (cargoId !== undefined) {
      const cargoTemplate = await resolveCargo(tx, Number(cargoId));
      await cargoModel.updateCargo(tx, existing.cargo_id, cargoTemplate);
    }

    if (senha !== undefined) {
      const senhaHash = await bcrypt.hash(String(senha), env.BCRYPT_SALT_ROUNDS);
      await loginModel.updateSenha(tx, employeeId, senhaHash);
    }

    await employeeModel.updateEmployee(tx, employeeId, fields);
  });

  const updated = await employeeModel.findById(employeeId);

  await registerAuditLog({
    evento: "funcionario_alterado",
    adminId,
    funcionarioId: employeeId,
    mensagem: "Dados de funcionario alterados",
    ipOrigem,
    metadados: {
      cpf: updated.cpf,
      email: updated.email,
      cargo_id: updated.cargo_id,
    },
  });

  return {
    funcionario: mapEmployee(updated),
  };
}

async function setEmployeeStatus(
  employeeId,
  ativo,
  { adminId, ipOrigem } = {}
) {
  const result = await employeeModel.updateEmployeeStatus(employeeId, ativo);

  if (!result.affectedRows) {
    throw new NotFoundError("Funcionario nao encontrado");
  }

  await registerAuditLog({
    evento: ativo ? "funcionario_ativado" : "funcionario_desativado",
    adminId,
    funcionarioId: employeeId,
    mensagem: ativo ? "Funcionario ativado" : "Funcionario desativado",
    ipOrigem,
  });

  return {
    id: employeeId,
    ativo,
  };
}

module.exports = {
  createEmployee,
  listEmployees,
  updateEmployee,
  setEmployeeStatus,
};