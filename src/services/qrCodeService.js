const { execute, executeOne } = require('../config/database');
const env = require('../config/env');
const {
  generateSecureToken,
  hashToken,
  isTokenExpired,
  isValidTokenFormat,
  tokenFingerprint
} = require('../utils/token');

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
    criado_em: row.criado_em,
    desativado_em: row.desativado_em,
    ...(includeSecret ? { qr_code: row.qr_code, url: row.url } : {})
  };
}

async function createQrCode({ adminId = null, unidadeCodigo = env.SCHOOL_UNIT_CODE, expiresAt = null, baseUrl = '' } = {}) {
  const qrCode = generateSecureToken();
  const qrCodeHash = hashToken(qrCode);
  const unitCode = getUnitCode(unidadeCodigo);
  const expirationDate = expiresAt instanceof Date ? expiresAt : getNextSaoPauloMidnight();
  const tokenHint = tokenFingerprint(qrCode);

  const result = await execute(
    `INSERT INTO qr_codes (codigo_hash, token_hint, contexto, unidade_codigo, ativo, valido_de, expira_em, criado_por_admin_id)
     VALUES (?, ?, ?, ?, 1, UTC_TIMESTAMP(), ?, ?)`,
    [qrCodeHash, tokenHint, QR_CONTEXT, unitCode, toMysqlDateTime(expirationDate), adminId]
  );

  const row = await executeOne(
    `SELECT id, token_hint, contexto, unidade_codigo, ativo, valido_de, expira_em, criado_em, desativado_em
     FROM qr_codes
     WHERE id = ?
     LIMIT 1`,
    [result.insertId]
  );

  const path = `/ponto/acessar?qr_code=${qrCode}`;
  return mapQrCode(
    {
      ...row,
      qr_code: qrCode,
      url: baseUrl ? `${baseUrl.replace(/\/$/, '')}${path}` : path
    },
    true
  );
}

async function listQrCodes({ page = 1, limit = 20 } = {}) {
  const safePage = Math.max(Number(page || 1), 1);
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
  const offset = (safePage - 1) * safeLimit;

  const totalRows = await executeOne('SELECT COUNT(*) AS total FROM qr_codes');
  const rows = await execute(
    `SELECT id, token_hint, contexto, unidade_codigo, ativo, valido_de, expira_em, criado_em, desativado_em
     FROM qr_codes
     ORDER BY criado_em DESC
     LIMIT ? OFFSET ?`,
    [safeLimit, offset]
  );

  return {
    items: rows.map((row) => mapQrCode(row)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: Number(totalRows?.total || 0)
    }
  };
}

function getQrCodeStatus(row, unidadeCodigo = env.SCHOOL_UNIT_CODE) {
  if (!row) {
    return 'inexistente';
  }
  if (!row.ativo) {
    return 'inativo';
  }
  if (isTokenExpired(row.expira_em)) {
    return 'expirado';
  }
  if (getUnitCode(row.unidade_codigo) !== getUnitCode(unidadeCodigo)) {
    return 'unidade_invalida';
  }
  return 'valido';
}

async function validateQrCode(qrCode, { unidadeCodigo = env.SCHOOL_UNIT_CODE } = {}) {
  if (!isValidTokenFormat(qrCode)) {
    return {
      valid: false,
      status: 'malformado',
      qrCode: null
    };
  }

  const qrCodeHash = hashToken(qrCode);
  const row = await executeOne(
    `SELECT id, codigo_hash, token_hint, contexto, unidade_codigo, ativo, valido_de, expira_em, criado_em, desativado_em
     FROM qr_codes
     WHERE codigo_hash = ?
     LIMIT 1`,
    [qrCodeHash]
  );
  const status = getQrCodeStatus(row, unidadeCodigo);

  return {
    valid: status === 'valido',
    status,
    qrCode: status === 'valido' ? mapQrCode(row) : null,
    qrCodeHash
  };
}

async function validateQrCodeById(id, qrCodeHash, { unidadeCodigo = env.SCHOOL_UNIT_CODE } = {}) {
  const qrId = Number(id);
  if (!Number.isInteger(qrId) || qrId <= 0 || typeof qrCodeHash !== 'string') {
    return {
      valid: false,
      status: 'inexistente',
      qrCode: null
    };
  }

  const row = await executeOne(
    `SELECT id, codigo_hash, token_hint, contexto, unidade_codigo, ativo, valido_de, expira_em, criado_em, desativado_em
     FROM qr_codes
     WHERE id = ? AND codigo_hash = ?
     LIMIT 1`,
    [qrId, qrCodeHash]
  );
  const status = getQrCodeStatus(row, unidadeCodigo);

  return {
    valid: status === 'valido',
    status,
    qrCode: status === 'valido' ? mapQrCode(row) : null
  };
}

async function deactivateQrCode(id) {
  const result = await execute(
    'UPDATE qr_codes SET ativo = 0, desativado_em = UTC_TIMESTAMP() WHERE id = ? AND ativo = 1',
    [Number(id)]
  );
  return result.affectedRows > 0;
}

module.exports = {
  QR_CONTEXT,
  createQrCode,
  listQrCodes,
  validateQrCode,
  validateQrCodeById,
  deactivateQrCode,
  mapQrCode
};
