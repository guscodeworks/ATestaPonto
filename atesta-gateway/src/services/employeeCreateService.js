"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} = require("../utils/errors");

function unavailable() {
  return new AppError("Servico de cadastro de funcionario indisponivel", {
    statusCode: 502,
    code: "EMPLOYEE_CREATE_SERVICE_UNAVAILABLE",
  });
}

async function createEmployee({
  nome,
  cpf,
  email,
  telefone,
  ativo,
  unidadeEscolarId,
  cargo,
  entrada,
  saidaAlmoco,
  retornoAlmoco,
  saida,
  senhaHash,
}) {
  let response;
  let body;
  try {
    response = await requestSpring("/internal/funcionarios", {
      method: "POST",
      body: {
        nome,
        cpf,
        email,
        telefone,
        ativo,
        unidade_escolar_id: unidadeEscolarId,
        cargo,
        entrada,
        saida_almoco: saidaAlmoco,
        retorno_almoco: retornoAlmoco,
        saida,
        senha_hash: senhaHash,
      },
    });
    const raw = await response.text();
    body = raw ? JSON.parse(raw) : null;
  } catch (_error) {
    throw unavailable();
  }

  if (response.status !== 201) {
    const message = body && typeof body.message === "string" ? body.message : "Falha ao cadastrar funcionario";
    if (response.status === 400) throw new BadRequestError(message);
    if (response.status === 404) throw new NotFoundError(message);
    if (response.status === 409) throw new ConflictError(message);
    throw unavailable();
  }

  if (!body || !Number.isSafeInteger(body.id) || body.id < 1
      || typeof body.cpf !== "string" || !/^\d{11}$/.test(body.cpf)
      || typeof body.nome !== "string" || typeof body.email !== "string"
      || !(body.telefone === null || typeof body.telefone === "string")
      || typeof body.ativo !== "boolean"
      || !(body.criado_em === null || typeof body.criado_em === "string")
      || typeof body.primeiro_acesso !== "boolean"
      || !Number.isSafeInteger(body.cargo_id) || body.cargo_id < 1
      || typeof body.cargo_nome !== "string") {
    throw unavailable();
  }

  return {
    id: body.id,
    cpf: body.cpf,
    nome: body.nome,
    email: body.email,
    telefone: body.telefone,
    ativo: body.ativo,
    criado_em: body.criado_em,
    primeiro_acesso: body.primeiro_acesso,
    cargo_id: body.cargo_id,
    cargo_nome: body.cargo_nome,
  };
}

module.exports = { createEmployee };
