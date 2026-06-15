<<<<<<< HEAD
"use strict";

const crypto = require("crypto");
const env = require("../config/env");
const { isValidTokenFormat } = require("../utils/token");

const QR_CONTEXT = "BATIDA_PONTO";
const SAO_PAULO_TIMEZONE = "America/Sao_Paulo";
const QR_TOKEN_TTL_MS = 10 * 60 * 1000;

function getSaoPauloDateParts(referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: SAO_PAULO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(referenceDate);
  const map = {};
  parts.forEach((part) => {
    map[part.type] = part.value;
  });

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
=======
const env = require("../config/env");

const QR_CONTEXT = "ATALHO_PONTO_FUNCIONARIO";
const FIXED_QR_ID = 1;
const FIXED_QR_ACCESS_PATH = "/ponto/acessar";

function getUnitCode(unidadeCodigo = env.SCHOOL_UNIT_CODE) {
  const normalized = String(unidadeCodigo || "DEFAULT")
    .trim()
    .toUpperCase();
  return normalized || "DEFAULT";
}

function buildAccessUrl(baseUrl = "") {
  const normalizedBaseUrl = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  return normalizedBaseUrl
    ? `${normalizedBaseUrl}${FIXED_QR_ACCESS_PATH}`
    : FIXED_QR_ACCESS_PATH;
}

function normalizeAccessPath(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).pathname.replace(/\/+$/, "") || "/";
  } catch (_error) {
    const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return path.replace(/\/+$/, "") || "/";
  }
}

function isFixedAccessQr(value) {
  return normalizeAccessPath(value).toLowerCase() === FIXED_QR_ACCESS_PATH;
}

function buildFixedQrPayload({
  unidadeCodigo = env.SCHOOL_UNIT_CODE,
  baseUrl = "",
} = {}) {
  const accessUrl = buildAccessUrl(baseUrl);

  return {
    id: FIXED_QR_ID,
    token_hint: "atalho-fixo",
    contexto: QR_CONTEXT,
    unidade_codigo: getUnitCode(unidadeCodigo),
    ativo: true,
    valido_de: null,
    expira_em: null,
    criado_em: null,
    desativado_em: null,
    qr_code: accessUrl,
    url: accessUrl,
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
  };
}

function getSaoPauloDayKey(referenceDate = new Date()) {
  const { year, month, day } = getSaoPauloDateParts(referenceDate);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getTokenWindow(referenceDate = new Date()) {
  const timestamp = referenceDate.getTime();
  const windowStartMs = Math.floor(timestamp / QR_TOKEN_TTL_MS) * QR_TOKEN_TTL_MS;
  const windowEndMs = windowStartMs + QR_TOKEN_TTL_MS;

  return {
    key: String(windowStartMs),
    startsAt: new Date(windowStartMs),
    expiresAt: new Date(windowEndMs),
  };
}

function toMysqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function getUnitCode(unidadeCodigo = env.SCHOOL_UNIT_CODE) {
  const normalized = String(unidadeCodigo || "DEFAULT").trim().toUpperCase();
  return normalized || "DEFAULT";
}

function getDailyToken({
  unidadeCodigo = env.SCHOOL_UNIT_CODE,
  referenceDate = new Date(),
} = {}) {
  const unitCode = getUnitCode(unidadeCodigo);
  const dayKey = getSaoPauloDayKey(referenceDate);
  const tokenWindow = getTokenWindow(referenceDate);
  const payload = `${dayKey}:${unitCode}:${tokenWindow.key}`;
  return crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("hex");
}

function isSameToken(candidate, expected) {
  if (!isValidTokenFormat(candidate) || !isValidTokenFormat(expected)) {
    return false;
  }

  const left = Buffer.from(candidate, "hex");
  const right = Buffer.from(expected, "hex");
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function mapQrCode(row, includeSecret = false) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    token_hint: row.token_hint,
    contexto: row.contexto,
    unidade_codigo: row.unidade_codigo,
    ativo: Boolean(row.ativo),
    valido_de: row.valido_de,
    expira_em: row.expira_em,
    expires_at_iso: row.expires_at_iso,
    criado_em: row.criado_em,
    desativado_em: row.desativado_em,
    ...(includeSecret ? { qr_code: row.qr_code, url: row.url } : {}),
  };
}

<<<<<<< HEAD
function buildDailyQrPayload({
  unidadeCodigo = env.SCHOOL_UNIT_CODE,
  baseUrl = "",
  referenceDate = new Date(),
} = {}) {
  const qrCode = getDailyToken({ unidadeCodigo, referenceDate });
  const dayKey = getSaoPauloDayKey(referenceDate);
  const tokenWindow = getTokenWindow(referenceDate);
  const id = Number(
    `${dayKey.replace(/-/g, "")}${String(
      Math.floor(tokenWindow.startsAt.getTime() / QR_TOKEN_TTL_MS)
    ).slice(-4)}`
  );
  const path = `/ponto/acessar?qr_code=${qrCode}`;

  return {
    id,
    token_hint: qrCode.slice(0, 12),
    contexto: QR_CONTEXT,
    unidade_codigo: getUnitCode(unidadeCodigo),
    ativo: true,
    valido_de: toMysqlDateTime(tokenWindow.startsAt),
    expira_em: toMysqlDateTime(tokenWindow.expiresAt),
    expires_at_iso: tokenWindow.expiresAt.toISOString(),
    criado_em: toMysqlDateTime(referenceDate),
    desativado_em: null,
    qr_code: qrCode,
    url: baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path,
  };
}

=======
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
async function createQrCode({
  unidadeCodigo = env.SCHOOL_UNIT_CODE,
  baseUrl = "",
} = {}) {
<<<<<<< HEAD
  const payload = buildDailyQrPayload({
    unidadeCodigo,
    baseUrl,
    referenceDate: new Date(),
  });
  return mapQrCode(payload, true);
=======
  return mapQrCode(buildFixedQrPayload({ unidadeCodigo, baseUrl }), true);
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
}

async function listQrCodes({ page = 1, limit = 20 } = {}) {
  const safePage = Math.max(Number(page || 1), 1);
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
  const payload = buildDailyQrPayload();
  const items = safePage === 1 && safeLimit > 0 ? [mapQrCode(payload)] : [];

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: 1,
    },
  };
}

<<<<<<< HEAD
async function validateQrCode(qrCode, {
  unidadeCodigo = env.SCHOOL_UNIT_CODE,
  referenceDate = new Date(),
} = {}) {
  const normalizedQrCode = String(qrCode || "").trim();
  const payload = buildDailyQrPayload({ unidadeCodigo, referenceDate });
  const isValid = isSameToken(normalizedQrCode, payload.qr_code);

  return {
    valid: isValid,
    status: isValid ? "ativo" : "invalido_ou_expirado",
=======
async function validateQrCode(
  qrCode,
  { unidadeCodigo = env.SCHOOL_UNIT_CODE } = {}
) {
  const isValid = isFixedAccessQr(qrCode);
  const payload = buildFixedQrPayload({ unidadeCodigo });

  return {
    valid: isValid,
    status: isValid ? "link_de_ponto" : "rota_invalida",
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
    qrCode: isValid ? mapQrCode(payload) : null,
  };
}

async function deactivateQrCode(_id) {
  return false;
}

module.exports = {
  QR_CONTEXT,
  QR_TOKEN_TTL_MS,
  createQrCode,
  listQrCodes,
  validateQrCode,
  deactivateQrCode,
  mapQrCode,
};
