"use strict";

const env = require("../config/env");
const { AppError, BadRequestError, NotFoundError } = require("../utils/errors");

function normalizeCep(value) {
  const cep = String(value ?? "").trim();
  if (!/^\d{5}-?\d{3}$/.test(cep)) {
    throw new BadRequestError("CEP invalido. Informe os 8 digitos do CEP.");
  }
  return cep.replace("-", "");
}

function normalizeOptionalText(value, maxLength) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text && text.length <= maxLength ? text : null;
}

function normalizeCoordinate(value, min, max) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : null;
}

function readCoordinates(location) {
  const coordinates = location && location.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    return {
      longitude: normalizeCoordinate(coordinates[0], -180, 180),
      latitude: normalizeCoordinate(coordinates[1], -90, 90),
    };
  }

  return {
    longitude: normalizeCoordinate(coordinates?.longitude, -180, 180),
    latitude: normalizeCoordinate(coordinates?.latitude, -90, 90),
  };
}

function mapCepResponse(payload, cep) {
  const street = normalizeOptionalText(payload?.street, 180);
  const neighborhood = normalizeOptionalText(payload?.neighborhood, 100);
  const coordinates = readCoordinates(payload?.location);
  const address = [street, neighborhood].filter(Boolean).join(" - ") || null;

  return {
    cep,
    endereco: address,
    cidade: normalizeOptionalText(payload?.city, 100),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}

function unavailableError(code, message) {
  return new AppError(message, {
    statusCode: 503,
    code,
  });
}

async function lookupCep(value, { fetchImpl = fetch } = {}) {
  const cep = normalizeCep(value);
  const url = `${env.BRASIL_API_CEP_BASE_URL}/cep/v2/${cep}`;
  let response;

  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(env.BRASIL_API_CEP_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      throw unavailableError(
        "CEP_LOOKUP_TIMEOUT",
        "Consulta de CEP excedeu o tempo limite."
      );
    }
    throw unavailableError(
      "CEP_SERVICE_UNAVAILABLE",
      "Consulta de CEP temporariamente indisponivel."
    );
  }

  if (response.status === 400) {
    throw new BadRequestError("CEP invalido.");
  }
  if (response.status === 404) {
    throw new NotFoundError("CEP nao encontrado.");
  }
  if (!response.ok) {
    throw unavailableError(
      "CEP_SERVICE_UNAVAILABLE",
      "Consulta de CEP temporariamente indisponivel."
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    throw unavailableError(
      "CEP_SERVICE_UNAVAILABLE",
      "Resposta invalida na consulta de CEP."
    );
  }

  return mapCepResponse(payload, cep);
}

module.exports = {
  normalizeCep,
  mapCepResponse,
  lookupCep,
};
