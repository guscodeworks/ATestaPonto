const crypto = require('crypto');

const DEFAULT_TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

function generateSecureToken(bytes = DEFAULT_TOKEN_BYTES) {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 128) {
    throw new TypeError('Token byte size must be an integer between 16 and 128');
  }
  return crypto.randomBytes(bytes).toString('hex');
}

function isValidTokenFormat(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token.trim());
}

function hashToken(token) {
  if (!isValidTokenFormat(token)) {
    throw new TypeError('Invalid token format');
  }
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

function compareTokenHash(token, expectedHash) {
  if (!isValidTokenFormat(token)) {
    return false;
  }
  if (typeof expectedHash !== 'string' || !HASH_PATTERN.test(expectedHash)) {
    return false;
  }

  const currentHash = hashToken(token);
  const left = Buffer.from(currentHash, 'hex');
  const right = Buffer.from(expectedHash, 'hex');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function createTokenPayload(expiresInMinutes = 5) {
  if (!Number.isInteger(expiresInMinutes) || expiresInMinutes < 1 || expiresInMinutes > 1440) {
    throw new TypeError('expiresInMinutes must be an integer between 1 and 1440');
  }

  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  return {
    token,
    tokenHash,
    expiresAt
  };
}

function isTokenExpired(expiresAt) {
  const parsedDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return true;
  }
  return parsedDate.getTime() <= Date.now();
}

function isActiveQrToken(tokenRecord) {
  if (!tokenRecord || typeof tokenRecord !== 'object') {
    return false;
  }

  const isActive = Boolean(tokenRecord.ativo ?? tokenRecord.active ?? false);
  const usedAt = tokenRecord.usado_em ?? tokenRecord.usedAt ?? null;
  const expiresAt = tokenRecord.expira_em ?? tokenRecord.expiresAt ?? null;

  if (!isActive || usedAt) {
    return false;
  }

  return !isTokenExpired(expiresAt);
}

function tokenFingerprint(token) {
  if (!isValidTokenFormat(token)) {
    return null;
  }
  return hashToken(token).slice(0, 12);
}

module.exports = {
  generateSecureToken,
  hashToken,
  compareTokenHash,
  createTokenPayload,
  isTokenExpired,
  isActiveQrToken,
  isValidTokenFormat,
  tokenFingerprint
};
