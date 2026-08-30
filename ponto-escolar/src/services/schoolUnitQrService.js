"use strict";

const crypto = require("node:crypto");
const { buildRedisKeyPrefix, getRedisClient } = require("../config/redis");
const {
  generateSecureToken,
  hashToken,
  isValidTokenFormat,
} = require("../utils/token");
const { BadRequestError } = require("../utils/errors");

const POINT_ACCESS_PATH = "/ponto/acessar";
const QR_UNIT_KEY_PREFIX = buildRedisKeyPrefix("ponto", "qr", "unit");
const QR_TOKEN_KEY_PREFIX = buildRedisKeyPrefix("ponto", "qr", "token");

// Atualiza os dois índices no mesmo comando Redis: o token antigo deixa de
// resolver antes de o novo QR ficar visível para a unidade.
const REGENERATE_QR_SCRIPT = `
  local previousJson = redis.call("GET", KEYS[1])
  if previousJson then
    local previous = cjson.decode(previousJson)
    if previous.tokenHash then
      redis.call("DEL", ARGV[3] .. previous.tokenHash)
    end
  end
  redis.call("SET", KEYS[1], ARGV[1])
  redis.call("SET", KEYS[2], ARGV[2])
  return 1
`;

function normalizeSchoolUnitId(value) {
  const unidadeEscolarId = Number(value);
  if (!Number.isInteger(unidadeEscolarId) || unidadeEscolarId < 1) {
    throw new BadRequestError("unidade_escolar_id invalido");
  }
  return unidadeEscolarId;
}

function hashKeyPart(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function buildSchoolUnitQrKey(unidadeEscolarId) {
  return `${QR_UNIT_KEY_PREFIX}${hashKeyPart(
    normalizeSchoolUnitId(unidadeEscolarId)
  )}`;
}

function buildQrTokenKey(tokenHash) {
  return `${QR_TOKEN_KEY_PREFIX}${tokenHash}`;
}

function buildQrAccessUrl(token, baseUrl = "") {
  const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/+$/, "");
  return normalizedBaseUrl
    ? `${normalizedBaseUrl}${POINT_ACCESS_PATH}?qr=${encodeURIComponent(token)}`
    : `${POINT_ACCESS_PATH}?qr=${encodeURIComponent(token)}`;
}

function parseQrRecord(value) {
  try {
    const record = typeof value === "string" ? JSON.parse(value) : value;
    if (!record || !isValidTokenFormat(record.token)) {
      return null;
    }

    const tokenHash = hashToken(record.token);
    if (tokenHash !== record.tokenHash) {
      return null;
    }

    return { token: record.token, tokenHash };
  } catch (_error) {
    return null;
  }
}

function mapQr(unidadeEscolarId, token, baseUrl) {
  return {
    unidade_escolar_id: unidadeEscolarId,
    url: buildQrAccessUrl(token, baseUrl),
  };
}

// Não usa TTL: o QR só deixa de valer quando a unidade o regenera.
async function generateSchoolUnitQr({ unidadeEscolarId, baseUrl = "" } = {}) {
  const safeUnidadeEscolarId = normalizeSchoolUnitId(unidadeEscolarId);
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const record = JSON.stringify({ token, tokenHash });
  const redis = getRedisClient();

  await redis.eval(
    REGENERATE_QR_SCRIPT,
    [
      buildSchoolUnitQrKey(safeUnidadeEscolarId),
      buildQrTokenKey(tokenHash),
    ],
    [record, String(safeUnidadeEscolarId), QR_TOKEN_KEY_PREFIX]
  );

  return mapQr(safeUnidadeEscolarId, token, baseUrl);
}

// A geração é também a regeneração: substitui o token anterior de forma atômica.
const regenerateSchoolUnitQr = generateSchoolUnitQr;

async function findCurrentSchoolUnitQr(unidadeEscolarId, { baseUrl = "" } = {}) {
  const safeUnidadeEscolarId = normalizeSchoolUnitId(unidadeEscolarId);
  const stored = await getRedisClient().get(
    buildSchoolUnitQrKey(safeUnidadeEscolarId)
  );
  const record = parseQrRecord(stored);

  return record
    ? mapQr(safeUnidadeEscolarId, record.token, baseUrl)
    : null;
}

// Consulta direta pelo hash do token; nunca percorre chaves de unidades.
async function resolveSchoolUnitByQrToken(token) {
  if (!isValidTokenFormat(token)) {
    return null;
  }

  const tokenHash = hashToken(token);
  const redis = getRedisClient();
  const unidadeValue = await redis.get(buildQrTokenKey(tokenHash));
  const unidadeEscolarId = Number(unidadeValue);
  if (!Number.isInteger(unidadeEscolarId) || unidadeEscolarId < 1) {
    return null;
  }

  // Confirma no índice direto para falhar fechado diante de dado inconsistente.
  const current = parseQrRecord(
    await redis.get(buildSchoolUnitQrKey(unidadeEscolarId))
  );
  if (!current || current.tokenHash !== tokenHash) {
    return null;
  }

  return { unidade_escolar_id: unidadeEscolarId };
}

module.exports = {
  POINT_ACCESS_PATH,
  buildSchoolUnitQrKey,
  buildQrTokenKey,
  buildQrAccessUrl,
  generateSchoolUnitQr,
  regenerateSchoolUnitQr,
  findCurrentSchoolUnitQr,
  resolveSchoolUnitByQrToken,
};
