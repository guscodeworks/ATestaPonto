"use strict";

const env = require("../config/env");
const { AppError, ValidationError } = require("../utils/errors");

// Integração com a BrasilAPI CEP v2 (https://brasilapi.com.br/docs#tag/CEP-V2).
// Este service só CONSULTA e NORMALIZA. Não grava nada e não decide se a
// resposta prevalece sobre o que o administrador informou: essa decisão é da
// regra de negócio de escolas (schoolUnitService).

const UFS_VALIDAS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

// Caixa envolvente do Brasil (inclui ilhas oceânicas). Descarta coordenadas
// absurdas, como (0, 0), que o provedor às vezes devolve por falha de geocodificação.
const LIMITES_BRASIL = Object.freeze({
  latMin: -34,
  latMax: 6,
  lngMin: -74.5,
  lngMax: -28,
});

class CepNaoEncontradoError extends AppError {
  constructor() {
    super("CEP nao encontrado na base de consulta", {
      statusCode: 404,
      code: "CEP_NAO_ENCONTRADO",
    });
  }
}

// Timeout, rede fora, 5xx, 429 ou resposta ilegível: o provedor não respondeu
// de forma utilizável. O cadastro decide se segue com endereço manual.
class CepIndisponivelError extends AppError {
  constructor(motivo = "CEP_INDISPONIVEL", statusCode = 503) {
    super("Servico de consulta de CEP indisponivel no momento", {
      statusCode,
      code: motivo,
    });
  }
}

// Usada também para conferir coordenadas digitadas pelo administrador.
function coordenadasDentroDoBrasil(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= LIMITES_BRASIL.latMin &&
    latitude <= LIMITES_BRASIL.latMax &&
    longitude >= LIMITES_BRASIL.lngMin &&
    longitude <= LIMITES_BRASIL.lngMax
  );
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

function limparTexto(valor, max) {
  if (typeof valor !== "string") return null;
  const texto = valor
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return texto ? texto.slice(0, max) : null;
}

// A API devolve coordenadas como string ("-46.6573802") e, em CEPs sem
// geocodificação, `coordinates: {}`. Qualquer coisa fora do esperado vira null.
function lerCoordenada(valor, min, max) {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  if (typeof valor === "string" && !/^[+-]?\d+(\.\d+)?$/.test(valor.trim())) return null;

  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < min || numero > max) return null;
  return Number(numero.toFixed(8));
}

function lerCoordenadas(location) {
  const coords = location && typeof location === "object" ? location.coordinates : null;
  if (!coords || typeof coords !== "object") return { latitude: null, longitude: null };

  const latitude = lerCoordenada(coords.latitude, LIMITES_BRASIL.latMin, LIMITES_BRASIL.latMax);
  const longitude = lerCoordenada(coords.longitude, LIMITES_BRASIL.lngMin, LIMITES_BRASIL.lngMax);

  // Par incompleto não serve: ou vêm as duas ou nenhuma.
  if (latitude === null || longitude === null) return { latitude: null, longitude: null };
  return { latitude, longitude };
}

// Aproveita somente o que o ATestaPonto usa (descarta `service`, `type` etc.).
function normalizarResposta(dados, cepConsultado) {
  if (!dados || typeof dados !== "object" || normalizarCep(dados.cep) !== cepConsultado) {
    // Resposta de outro CEP ou sem formato esperado: não confiar.
    throw new CepIndisponivelError("CEP_RESPOSTA_INVALIDA", 502);
  }

  const uf = limparTexto(dados.state, 2)?.toUpperCase() ?? null;
  const { latitude, longitude } = lerCoordenadas(dados.location);

  return {
    cep: cepConsultado,
    logradouro: limparTexto(dados.street, 255),
    bairro: limparTexto(dados.neighborhood, 100),
    cidade: limparTexto(dados.city, 100),
    uf: uf && UFS_VALIDAS.has(uf) ? uf : null,
    latitude,
    longitude,
  };
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
    resposta = await fetch(`${env.BRASILAPI_BASE_URL}/cep/v2/${cep}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(env.BRASILAPI_TIMEOUT_MS),
      // Não segue redirecionamentos para outro host.
      redirect: "error",
    });
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
  // 400 da API com CEP que já validamos aqui indica incompatibilidade do
  // provedor, não erro do usuário; tratamos como indisponibilidade.
  if (!resposta.ok) {
    throw new CepIndisponivelError(
      resposta.status === 429 ? "CEP_LIMITE_PROVEDOR" : "CEP_INDISPONIVEL",
      503
    );
  }

  let dados;
  try {
    dados = await resposta.json();
  } catch (_error) {
    throw new CepIndisponivelError("CEP_RESPOSTA_INVALIDA", 502);
  }

  return normalizarResposta(dados, cep);
}

module.exports = {
  consultarCep,
  normalizarCep,
  isCepValido,
  coordenadasDentroDoBrasil,
  CepNaoEncontradoError,
  CepIndisponivelError,
};
