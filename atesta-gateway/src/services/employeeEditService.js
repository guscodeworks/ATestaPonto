"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const {
  AppError, BadRequestError, ForbiddenError, NotFoundError, ConflictError,
  ValidationError, InternalServerError,
} = require("../utils/errors");

function unavailable() {
  return new AppError("Servico de edicao de funcionario indisponivel", {
    statusCode: 502,
    code: "EMPLOYEE_EDIT_SERVICE_UNAVAILABLE",
  });
}

async function updateEmployee(employeeId, fields, vinculo) {
  if (!vinculo || ![employeeId, vinculo.id, vinculo.unidadeEscolarId, vinculo.diretoriaEnsinoId]
    .every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw new ForbiddenError("Escopo do funcionario invalido");
  }

  let response;
  let body;
  try {
    response = await requestSpring(`/internal/funcionarios/${employeeId}`, {
      method: "PATCH",
      body: {
        vinculo_id: vinculo.id,
        unidade_escolar_id: vinculo.unidadeEscolarId,
        diretoria_ensino_id: vinculo.diretoriaEnsinoId,
        campos: fields,
      },
    });
    const raw = await response.text();
    body = raw ? JSON.parse(raw) : null;
  } catch (_error) {
    throw unavailable();
  }

  if (response.status !== 200) {
    const message = typeof body?.message === "string" ? body.message : "Falha ao editar funcionario";
    if (response.status === 400) throw new BadRequestError(message);
    if (response.status === 403) throw new ForbiddenError(message);
    if (response.status === 404) throw new NotFoundError(message);
    if (response.status === 409) throw new ConflictError(message);
    if (response.status === 422) throw new ValidationError(message);
    if (response.status === 500 && body?.code === "DATABASE_ERROR") throw new InternalServerError();
    throw unavailable();
  }

  const times = ["entrada", "saida_almoco", "retorno_almoco", "saida"];
  if (!body || body.id !== employeeId || typeof body.cpf !== "string" || !/^\d{11}$/.test(body.cpf)
    || typeof body.nome !== "string" || typeof body.email !== "string"
    || !(body.telefone === null || typeof body.telefone === "string")
    || !Number.isSafeInteger(body.cargo_id) || body.cargo_id < 1
    || !["FUNCIONARIO", "INSPETOR", "PROFESSOR"].includes(body.cargo)
    || times.some((field) => typeof body[field] !== "string"
      || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(body[field]))) {
    throw unavailable();
  }
  return {
    id: body.id, nome: body.nome, cpf: body.cpf, email: body.email,
    telefone: body.telefone, cargo_id: body.cargo_id, cargo: body.cargo,
    entrada: body.entrada, saida_almoco: body.saida_almoco,
    retorno_almoco: body.retorno_almoco, saida: body.saida,
  };
}

module.exports = { updateEmployee };
