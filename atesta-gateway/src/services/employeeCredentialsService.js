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

function updatePassword(operation, funcionarioId, senhaHash) {
  return requestCredentials(operation, {
    funcionario_id: Number(funcionarioId), senha_hash: senhaHash,
  }, (result) => {
    if (result.updated !== true) throw unavailable();
  });
}

module.exports = { findRecoveryEmployee, updatePassword };
