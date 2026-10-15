"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError, ConflictError, UnauthorizedError } = require("../utils/errors");

function unavailable() {
  return new AppError("Servico de credenciais indisponivel", {
    statusCode: 502, code: "EMPLOYEE_CREDENTIALS_SERVICE_UNAVAILABLE",
  });
}

async function requestCredentials(operation, body, project) {
  let response;
  let result;
  try {
    response = await requestSpring(`/internal/credenciais-funcionarios/${operation}`, {
      method: "POST", body,
    });
    result = await response.json();
  } catch (_error) {
    throw unavailable();
  }
  if (!response.ok) {
    if (response.status === 401 && result?.code === "UNAUTHORIZED" && operation === "ultimo-login") {
      throw new UnauthorizedError("CPF/email ou senha invalidos");
    }
    if (response.status === 401 && result?.code === "UNAUTHORIZED"
        && ["primeiro-acesso", "redefinir-senha"].includes(operation)) {
      throw new UnauthorizedError(operation === "primeiro-acesso"
        ? "Comprovante de primeiro acesso invalido" : "Nao foi possivel redefinir a senha.");
    }
    if (response.status === 409 && result?.code === "CONFLICT" && operation === "primeiro-acesso") {
      throw new ConflictError("O primeiro acesso ja foi concluido");
    }
    throw unavailable();
  }
  try {
    if (response.status !== 200) throw unavailable();
    return project(result);
  } catch (_error) {
    throw unavailable();
  }
}

function findRecoveryEmployee(cpf) {
  return requestCredentials("recuperacao", { cpf }, (result) => {
    if (result.employee === null) return null;
    const { id, nome, email } = result.employee;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof nome !== "string"
        || typeof email !== "string" || !email) throw unavailable();
    return { id, nome, email };
  });
}

function authenticationEmployee(result) {
  if (result.employee === null) return null;
  const { id, cpf, nome, email, ativo, senha_hash, primeiro_acesso } = result.employee;
  if (!Number.isSafeInteger(id) || id <= 0 || typeof cpf !== "string" || !/^\d{11}$/.test(cpf)
      || typeof nome !== "string" || !nome.trim() || !(email === null || typeof email === "string")
      || ativo !== true || typeof primeiro_acesso !== "boolean"
      || typeof senha_hash !== "string" || !/^\$2[ab]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/.test(senha_hash)) {
    throw unavailable();
  }
  return { id, cpf, nome, email, ativo, senha_hash, primeiro_acesso };
}

function findLoginEmployee({ cpf, email }) {
  return requestCredentials("login", email ? { email } : { cpf }, (result) => {
    const employee = authenticationEmployee(result);
    if (employee && (email ? employee.email?.toLowerCase() !== email : employee.cpf !== cpf)) throw unavailable();
    return employee;
  });
}

function findTokenEmployee(funcionarioId) {
  return requestCredentials("validacao-token", { funcionario_id: Number(funcionarioId) }, (result) => {
    const employee = authenticationEmployee(result);
    if (employee && employee.id !== Number(funcionarioId)) throw unavailable();
    return employee;
  });
}

function findLoginLink(funcionarioId) {
  return requestCredentials("vinculo-ativo", { funcionario_id: Number(funcionarioId) }, (result) => {
    const { modern, vinculo } = result;
    if (typeof modern !== "boolean" || (!modern && vinculo !== null)) throw unavailable();
    if (vinculo === null) return { modern, vinculo: null };
    const { id, unidade_escolar_id } = vinculo;
    if (![id, unidade_escolar_id].every(value => Number.isSafeInteger(value) && value > 0)) throw unavailable();
    return { modern, vinculo: { id, unidade_escolar_id } };
  });
}

function updatePassword(operation, funcionarioId, senhaHash) {
  return requestCredentials(operation, {
    funcionario_id: Number(funcionarioId), senha_hash: senhaHash,
  }, (result) => {
    if (result.updated !== true) throw unavailable();
  });
}

function updateLastLogin(funcionarioId, modern) {
  return requestCredentials("ultimo-login", { funcionario_id: Number(funcionarioId) }, (result) => {
    if (typeof result.updated !== "boolean" || (modern && !result.updated)) throw unavailable();
    return { affectedRows: result.updated ? 1 : 0 };
  });
}

module.exports = {
  findRecoveryEmployee, updatePassword, updateLastLogin, findLoginEmployee, findTokenEmployee, findLoginLink,
};
