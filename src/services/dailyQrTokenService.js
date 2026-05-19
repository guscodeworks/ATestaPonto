const crypto = require('crypto');
const env = require('../config/env');
const { isValidTokenFormat } = require('../utils/token');

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';
const TOKEN_CONTEXT = 'BATIDA_PONTO';
const ROTATION_LABEL = 'DIARIA_00:00';

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
    year: map.year,
    month: map.month,
    day: map.day
  };
}

function getSaoPauloDateKey(referenceDate = new Date()) {
  const parts = getSaoPauloDateParts(referenceDate);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function buildTokenForDate(dateKey) {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(`QR_DAILY|${dateKey}|${TOKEN_CONTEXT}`).digest('hex');
}

function getNextSaoPauloMidnightIso(referenceDate = new Date()) {
  const { year, month, day } = getSaoPauloDateParts(referenceDate);
  // Brasilia currently uses UTC-03 year-round, so local 00:00 maps to 03:00 UTC.
  const nextMidnightUtc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1, 3, 0, 0, 0));
  return nextMidnightUtc.toISOString();
}

function timingSafeTokenEquals(leftToken, rightToken) {
  if (!isValidTokenFormat(leftToken) || !isValidTokenFormat(rightToken)) {
    return false;
  }

  const left = Buffer.from(leftToken.trim().toLowerCase(), 'hex');
  const right = Buffer.from(rightToken.trim().toLowerCase(), 'hex');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function getDailyQrToken(referenceDate = new Date()) {
  const dateKey = getSaoPauloDateKey(referenceDate);
  return buildTokenForDate(dateKey);
}

function getDailyQrTokenPayload(referenceDate = new Date()) {
  const dateKey = getSaoPauloDateKey(referenceDate);
  const token = buildTokenForDate(dateKey);

  return {
    id: Number(dateKey.replace(/-/g, '')),
    token,
    token_hint: `${token.slice(0, 6)}...${token.slice(-4)}`,
    contexto: TOKEN_CONTEXT,
    ativo: true,
    data_referencia: dateKey,
    rotacao: ROTATION_LABEL,
    timezone: SAO_PAULO_TIMEZONE,
    expira_em: getNextSaoPauloMidnightIso(referenceDate)
  };
}

function isDailyQrTokenValid(qrToken, referenceDate = new Date()) {
  const expectedToken = getDailyQrToken(referenceDate);
  return timingSafeTokenEquals(qrToken, expectedToken);
}

module.exports = {
  getDailyQrToken,
  getDailyQrTokenPayload,
  isDailyQrTokenValid,
  getSaoPauloDateKey
};
