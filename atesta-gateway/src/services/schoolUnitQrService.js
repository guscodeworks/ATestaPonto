"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { isValidTokenFormat } = require("../utils/token");
const { AppError, BadRequestError } = require("../utils/errors");

const POINT_ACCESS_PATH = "/ponto/acessar";

function normalizeSchoolUnitId(value) {
  const unidadeEscolarId = Number(value);
  if (!Number.isInteger(unidadeEscolarId) || unidadeEscolarId < 1) {
    throw new BadRequestError("unidade_escolar_id invalido");
  }
  return unidadeEscolarId;
}

function buildQrAccessUrl(token, baseUrl = "") {
  const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/+$/, "");
  return `${normalizedBaseUrl}${POINT_ACCESS_PATH}?qr=${encodeURIComponent(token)}`;
}

function unavailable() {
  return new AppError("Servico de QR escolar indisponivel", {
    statusCode: 502, code: "SCHOOL_QR_SERVICE_UNAVAILABLE",
  });
}

async function requestQr(operation, body, project) {
  let response;
  let result;
  try {
    response = await requestSpring(`/internal/escolas/qr/${operation}`, { method: "POST", body });
    result = await response.json();
  } catch (_error) {
    throw unavailable();
  }
  if (!response.ok) {
    if (response.status === 400 && result?.code === "BAD_REQUEST") {
      throw new BadRequestError("unidade_escolar_id invalido");
    }
    throw unavailable();
  }
  try {
    return project(result);
  } catch (_error) {
    throw unavailable();
  }
}

function publicQr(result, unidadeEscolarId, baseUrl, nullable) {
  const qr = result.qrCode;
  if (nullable && qr === null) return null;
  if (qr?.unidade_escolar_id !== unidadeEscolarId || typeof qr.url !== "string") throw unavailable();
  const prefix = buildQrAccessUrl("", baseUrl);
  if (!qr.url.startsWith(prefix)) throw unavailable();
  const token = decodeURIComponent(qr.url.slice(prefix.length));
  if (!isValidTokenFormat(token) || qr.url !== buildQrAccessUrl(token, baseUrl)) throw unavailable();
  return { unidade_escolar_id: unidadeEscolarId, url: qr.url };
}

async function generateSchoolUnitQr({ unidadeEscolarId, baseUrl = "" } = {}) {
  const id = normalizeSchoolUnitId(unidadeEscolarId);
  const base = String(baseUrl || "");
  return requestQr("gerar", { unidade_escolar_id: id, base_url: base },
    result => publicQr(result, id, base, false));
}

const regenerateSchoolUnitQr = generateSchoolUnitQr;

async function findCurrentSchoolUnitQr(unidadeEscolarId, { baseUrl = "" } = {}) {
  const id = normalizeSchoolUnitId(unidadeEscolarId);
  const base = String(baseUrl || "");
  return requestQr("atual", { unidade_escolar_id: id, base_url: base },
    result => publicQr(result, id, base, true));
}

module.exports = {
  POINT_ACCESS_PATH,
  buildQrAccessUrl,
  generateSchoolUnitQr,
  regenerateSchoolUnitQr,
  findCurrentSchoolUnitQr,
};
