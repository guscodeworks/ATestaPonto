"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError, ValidationError } = require("../utils/errors");

// Adaptador do contrato de CEP usado por escolas. Somente o Spring consulta
// a BrasilAPI e normaliza seus dados; aqui são preservados os nomes dos campos
// e os erros consumidos pelo schoolUnitService, sem chamada direta ao provedor.

class CepNaoEncontradoError extends AppError {
  constructor() {
    super("CEP nao encontrado na base de consulta", {
      statusCode: 404,
      code: "CEP_NAO_ENCONTRADO",
    });
  }
}

// Falha de transporte, erro do Spring ou resposta ilegível na consulta de CEP.
class CepIndisponivelError extends AppError {
  constructor(motivo = "CEP_INDISPONIVEL", statusCode = 503) {
    super("Servico de consulta de CEP indisponivel no momento", {
      statusCode,
      code: motivo,
    });
  }
}

// Mantém só os 8 dígitos. Aceita "13010-100", "13.010-100" e números soltos.
function normalizarCep(valor) {
  if (typeof valor !== "string" && typeof valor !== "number") return "";
  return String(valor).replace(/\D/g, "");
}

function isCepValido(cep) {
  // 8 dígitos e não repetidos (00000000, 11111111...), que nunca são CEPs reais.
  return /^\d{8}$/.test(cep) && !/^(\d)\1{7}$/.test(cep);
}

async function consultarCep(cepInformado) {
  const cep = normalizarCep(cepInformado);
  if (!isCepValido(cep)) {
    // Não chama a API com lixo e fecha qualquer brecha de montagem de URL.
    throw new ValidationError("CEP invalido", [
      { field: "cep", location: "body", message: "CEP deve ter 8 digitos validos" },
    ]);
  }

  let resposta;
  try {
    resposta = await requestSpring(`/internal/enderecos/cep/${cep}`);
  } catch (error) {
    const estourouTempo = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw new CepIndisponivelError(
      estourouTempo ? "CEP_TIMEOUT" : "CEP_INDISPONIVEL",
      estourouTempo ? 504 : 503
    );
  }

  if (resposta.status === 404) {
    throw new CepNaoEncontradoError();
  }
  if (resposta.status === 400) {
    throw new ValidationError("CEP invalido", [
      { field: "cep", location: "body", message: "CEP deve ter 8 digitos validos" },
    ]);
  }
  if (!resposta.ok) {
    throw new CepIndisponivelError("CEP_INDISPONIVEL", 502);
  }

  let dados;
  try {
    dados = await resposta.json();
  } catch (_error) {
    throw new CepIndisponivelError("CEP_RESPOSTA_INVALIDA", 502);
  }

  if (!dados || dados.cep !== cep) {
    throw new CepIndisponivelError("CEP_RESPOSTA_INVALIDA", 502);
  }
  return {
    cep: dados.cep,
    logradouro: dados.street,
    bairro: dados.neighborhood,
    cidade: dados.city,
    uf: dados.state,
    latitude: dados.latitude ?? null,
    longitude: dados.longitude ?? null,
  };
}

module.exports = {
  consultarCep,
  normalizarCep,
  isCepValido,
  CepNaoEncontradoError,
  CepIndisponivelError,
};
