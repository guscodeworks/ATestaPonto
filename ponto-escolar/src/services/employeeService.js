"use strict";

const bcrypt = require("bcrypt");
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

function mapEmployee(employee) {
  return {
    id: employee.id,
    cpf: maskCpf(employee.cpf),
    nome: employee.nome,
    email: employee.email,
    ativo: Boolean(employee.ativo),
    criado_em: employee.criado_em,
    primeiro_acesso: Boolean(employee.primeiro_acesso),
    cargo_id: employee.cargo_id,
    cargo_nome: employee.cargo_nome || null,
    login_id: employee.login_id,
  };
}

async function resolveCargoId(tx, requestedCargoId) {
  if (requestedCargoId) {
    const cargo = await cargoModel.findByIdForUpdate(tx, requestedCargoId);
    if (!cargo) {
      throw new BadRequestError("cargo_id informado nao existe");
    }
    return Number(cargo.id);
  }

  const defaultCargo = await cargoModel.findDefaultForUpdate(tx);
  if (!defaultCargo) {
    const result = await cargoModel.createDefault(tx);
    return Number(result.insertId);
  }
  return Number(defaultCargo.id);
}

async function createEmployee(body, { adminId, ipOrigem } = {}) {
  const nome = String(body.nome || "").trim();
  const cpf = String(body.cpf || "").trim();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const senha = String(body.senha || "");
  const ativo = body.ativo === undefined ? true : Boolean(body.ativo);
  const requestedCargoId = body.cargo_id ? Number(body.cargo_id) : null;
  const senhaHash = await bcrypt.hash(senha, 12);

  const employeeId = await employeeModel.withTransaction(async (tx) => {
    const cpfExists = await employeeModel.findByCpfForUpdate(tx, cpf);
    if (cpfExists) {
      throw new ConflictError("CPF ja cadastrado");
    }

    const emailExists = await employeeModel.findByEmailForUpdate(tx, email);
    if (emailExists) {
      throw new ConflictError("Email ja cadastrado");
    }

    const loginCpfExists = await loginModel.findByCpfForUpdate(tx, cpf);
    if (loginCpfExists) {
      throw new ConflictError("CPF ja cadastrado");
    }

    const cargoId = await resolveCargoId(tx, requestedCargoId);
    const loginInsert = await loginModel.createLogin(tx, { cpf, senhaHash });
    const loginId = Number(loginInsert.insertId);

    const result = await employeeModel.createEmployee(tx, {
      cpf,
      nome,
      email,
      senhaHash,
      ativo,
      cargoId,
      loginId,
    });
    return result.insertId;
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

async function updateEmployee(employeeId, body, { adminId, ipOrigem } = {}) {
  const nome = body.nome;
  const cpf = body.cpf;
  const email = body.email;
  const senha = body.senha;
  const ativo = body.ativo;
  const cargoId = body.cargo_id;

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

  await employeeModel.withTransaction(async (tx) => {
    const existing = await employeeModel.findByIdForUpdate(tx, employeeId);
    if (!existing) {
      throw new NotFoundError("Funcionario nao encontrado");
    }

    const fields = {};

    if (cpf !== undefined) {
      const normalizedCpf = String(cpf).trim();
      if (normalizedCpf !== existing.cpf) {
        const cpfExists = await employeeModel.findCpfConflictForUpdate(
          tx,
          normalizedCpf,
          employeeId
        );
        if (cpfExists) {
          throw new ConflictError("CPF ja cadastrado");
        }

        const loginCpfExists = await loginModel.findCpfConflictForUpdate(
          tx,
          normalizedCpf,
          existing.login_id
        );
        if (loginCpfExists) {
          throw new ConflictError("CPF ja cadastrado");
        }

        await loginModel.updateCpf(tx, existing.login_id, normalizedCpf);
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
      const cargo = await cargoModel.findByIdForUpdate(tx, Number(cargoId));
      if (!cargo) {
        throw new BadRequestError("cargo_id informado nao existe");
      }
      fields.cargoId = Number(cargoId);
    }

    if (senha !== undefined) {
      const senhaHash = await bcrypt.hash(String(senha), 12);
      fields.senhaHash = senhaHash;
      await loginModel.updateSenha(tx, existing.login_id, senhaHash);
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
