"use strict";

const bcrypt = require("bcrypt");
const env = require("../config/env");
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
    return null;
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

/**
 * Cria funcionario e login juntos para evitar credencial sem cadastro ativo.
 */
async function createEmployee(body, { adminId, ipOrigem } = {}) {
  const nome = String(body.nome || "").trim();
  const cpf = String(body.cpf || "").trim();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const senha = String(body.senha || "");
  const ativo = body.ativo === undefined ? true : Boolean(body.ativo);
  const cargoSchedule = readCargoSchedule(body);
  const requestedCargoId = Number(body.cargo_id);
  if (
    !cargoSchedule &&
    (!Number.isInteger(requestedCargoId) || requestedCargoId < 1)
  ) {
    throw new BadRequestError("cargo_id ou horarios do cargo sao obrigatorios");
  }
  const senhaHash = await bcrypt.hash(senha, env.BCRYPT_SALT_ROUNDS);

  // Toda a criação (checagens de duplicidade + inserts em login e funcionarios)
  // roda em uma única transação: funcionario e login são duas tabelas
  // relacionadas e precisam ser criadas atomicamente, sem risco de um
  // funcionário ficar sem login (ou vice-versa) em caso de falha no meio do processo.
  const employeeId = await employeeModel.withTransaction(async (tx) => {
    const cpfExists = await employeeModel.findByCpfForUpdate(tx, cpf);
    if (cpfExists?.id) {
      throw new ConflictError("CPF ja cadastrado");
    }

    const emailExists = await employeeModel.findByEmailForUpdate(tx, email);
    if (emailExists?.id) {
      throw new ConflictError("Email ja cadastrado");
    }

    const cargoTemplate =
      cargoSchedule || (await resolveCargo(tx, requestedCargoId));
    const cargoInsert = await cargoModel.createCargo(tx, cargoTemplate);
    const cargoId = Number(cargoInsert.insertId);

    const result = await employeeModel.createEmployee(tx, {
      cpf,
      nome,
      email,
      ativo,
      cargoId,
    });
    const funcionarioId = Number(result.insertId);

    await loginModel.createLogin(tx, { funcionarioId, senhaHash });
    return funcionarioId;
  });

  const created = await employeeModel.findById(employeeId);

  await registerAuditLog({
    evento: "funcionario_cadastrado",
    adminId,
    funcionarioId: employeeId,
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