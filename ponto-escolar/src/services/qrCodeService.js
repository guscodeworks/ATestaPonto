const crypto = require('crypto');
const env = require('../config/env');
const { isValidTokenFormat } = require('../utils/token');

const QR_CONTEXT = 'BATIDA_PONTO';
const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

function getSaoPauloDateParts(referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: SAO_PAULO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(referenceDate);
  const map = {};
  parts.forEach((part) => {
    map[part.type] = part.value;
  });

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day)
  };
}

function getSaoPauloDayKey(referenceDate = new Date()) {
  const { year, month, day } = getSaoPauloDateParts(referenceDate);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getNextSaoPauloMidnight(referenceDate = new Date()) {
  const { year, month, day } = getSaoPauloDateParts(referenceDate);
  return new Date(Date.UTC(year, month - 1, day + 1, 3, 0, 0, 0));
}

function toMysqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getUnitCode(unidadeCodigo = env.SCHOOL_UNIT_CODE) {
  const normalized = String(unidadeCodigo || 'DEFAULT').trim().toUpperCase();
  return normalized || 'DEFAULT';
}

function getDailyToken({ unidadeCodigo = env.SCHOOL_UNIT_CODE, referenceDate = new Date() } = {}) {
  const unitCode = getUnitCode(unidadeCodigo);
  const dayKey = getSaoPauloDayKey(referenceDate);
  const payload = `${dayKey}:${unitCode}`;
  return crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('hex');
}

function isSameToken(candidate, expected) {
  if (!isValidTokenFormat(candidate) || !isValidTokenFormat(expected)) {
    return false;
  }

  const left = Buffer.from(candidate, 'hex');
  const right = Buffer.from(expected, 'hex');
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
    ativo: true,
    valido_de: row.valido_de,
    expira_em: row.expira_em,
    criado_em: row.criado_em,
    desativado_em: null,
    ...(includeSecret ? { qr_code: row.qr_code, url: row.url } : {})
  };
}

function buildDailyQrPayload({ unidadeCodigo = env.SCHOOL_UNIT_CODE, baseUrl = '', referenceDate = new Date() } = {}) {
  const qrCode = getDailyToken({ unidadeCodigo, referenceDate });
  const dayKey = getSaoPauloDayKey(referenceDate);
  const id = Number(dayKey.replace(/-/g, ''));
  const now = referenceDate;
  const expirationDate = getNextSaoPauloMidnight(referenceDate);
  const path = `/ponto/acessar?qr_code=${qrCode}`;

  return {
    id,
    token_hint: qrCode.slice(0, 12),
    contexto: QR_CONTEXT,
    unidade_codigo: getUnitCode(unidadeCodigo),
    valido_de: toMysqlDateTime(now),
    expira_em: toMysqlDateTime(expirationDate),
    criado_em: toMysqlDateTime(now),
    qr_code: qrCode,
    url: baseUrl ? `${baseUrl.replace(/\/$/, '')}${path}` : path
  };
}

async function createQrCode({ unidadeCodigo = env.SCHOOL_UNIT_CODE, baseUrl = '' } = {}) {
  const payload = buildDailyQrPayload({ unidadeCodigo, baseUrl, referenceDate: new Date() });
  return mapQrCode(payload, true);
}

async function listQrCodes({ page = 1, limit = 20 } = {}) {
  const safePage = Math.max(Number(page || 1), 1);
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
  const payload = buildDailyQrPayload({ referenceDate: new Date() });
  const items = safePage === 1 && safeLimit > 0 ? [mapQrCode(payload)] : [];

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: 1
    }
  };
}

async function validateQrCode(qrCode, { unidadeCodigo = env.SCHOOL_UNIT_CODE } = {}) {
  if (!isValidTokenFormat(qrCode)) {
    return {
      valid: false,
      status: 'malformado',
      qrCode: null
    };
  }

  const payload = buildDailyQrPayload({ unidadeCodigo, referenceDate: new Date() });
  const isValid = isSameToken(qrCode, payload.qr_code);

  return {
    valid: isValid,
    status: isValid ? 'valido' : 'invalido_ou_expirado',
    qrCode: isValid ? mapQrCode(payload) : null
  };
}

async function deactivateQrCode(_id) {
  return false;
}

module.exports = {
  QR_CONTEXT,
  createQrCode,
  listQrCodes,
  validateQrCode,
  deactivateQrCode,
  mapQrCode,
  getDailyToken
};
