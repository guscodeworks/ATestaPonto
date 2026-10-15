"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const {
  AppError, BadRequestError, ForbiddenError, NotFoundError, ConflictError,
  ValidationError, InternalServerError,
} = require("../utils/errors");

function unavailable() {
  return new AppError("Servico de ativacao de funcionario indisponivel", {
    statusCode: 502,
    code: "EMPLOYEE_ACTIVATION_SERVICE_UNAVAILABLE",
  });
}

async function changeEmployeeActivation(employeeId, ativo, confirmation, vinculo) {
  if (!vinculo || ![employeeId, vinculo.id, vinculo.unidadeEscolarId, vinculo.diretoriaEnsinoId]
    .every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw new ForbiddenError("Escopo do funcionario invalido");
  }
  if (typeof ativo !== "boolean" || confirmation !== (ativo ? "REATIVAR" : "DESATIVAR")) {
    throw new BadRequestError("Operacao de ativacao invalida");
  }

  let response;
  let body;
  try {
    response = await requestSpring(`/internal/funcionarios/${employeeId}/${ativo ? "reativar" : "desativar"}`, {
      method: "PATCH",
      body: {
        confirmacao: confirmation,
        vinculo_id: vinculo.id,
        unidade_escolar_id: vinculo.unidadeEscolarId,
        diretoria_ensino_id: vinculo.diretoriaEnsinoId,
      },
    });
    const raw = await response.text();
    body = raw ? JSON.parse(raw) : null;
  } catch (_error) {
    throw unavailable();
  }

  if (response.status !== 200) {
    const message = typeof body?.message === "string" ? body.message : "Falha ao alterar ativacao do funcionario";
    if (response.status === 400) throw new BadRequestError(message);
    if (response.status === 403) throw new ForbiddenError(message);
    if (response.status === 404) throw new NotFoundError(message);
    if (response.status === 409) throw new ConflictError(message);
    if (response.status === 422) throw new ValidationError(message);
    if (response.status === 500) throw new InternalServerError();
    throw unavailable();
  }

  if (!body || body.id !== employeeId || body.ativo !== ativo
    || (ativo ? body.desativado_em !== null
      : typeof body.desativado_em !== "string"
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.desativado_em)
        || !Number.isFinite(Date.parse(body.desativado_em)))) {
    throw unavailable();
  }
  return { id: body.id, ativo: body.ativo, desativado_em: body.desativado_em };
}

module.exports = { changeEmployeeActivation };
