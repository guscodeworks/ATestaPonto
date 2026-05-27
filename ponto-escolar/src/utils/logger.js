const { maskCpf, normalizeCpf } = require('./cpf');

const MAX_STRING_LENGTH = 2000;
const MAX_DEPTH = 6;

function maskEmail(value) {
  if (typeof value !== 'string') {
    return '[REDACTED_EMAIL]';
  }

  const trimmed = value.trim();
  const atIndex = trimmed.indexOf('@');

  if (atIndex <= 0) {
    return '[REDACTED_EMAIL]';
  }

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  if (!domain) {
    return '[REDACTED_EMAIL]';
  }

  const visibleLocal = local.length <= 2 ? local[0] || '*' : `${local.slice(0, 2)}***`;
  return `${visibleLocal}@${domain}`;
}

function maskToken(value) {
  if (typeof value !== 'string') {
    return '[REDACTED_TOKEN]';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '[REDACTED_TOKEN]';
  }

  if (trimmed.startsWith('Bearer ')) {
    return 'Bearer [REDACTED]';
  }

  if (trimmed.length <= 12) {
    return '[REDACTED_TOKEN]';
  }

  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function isSensitiveKey(key) {
  const normalized = String(key || '').toLowerCase();
  return (
    normalized.includes('password') ||
    normalized.includes('senha') ||
    normalized.includes('token') ||
    normalized.includes('authorization') ||
    normalized.includes('jwt') ||
    normalized.includes('secret') ||
    normalized.includes('cookie')
  );
}

function sanitizePrimitiveByKey(key, value) {
  const normalizedKey = String(key || '').toLowerCase();

  if (normalizedKey.includes('cpf')) {
    const cpf = normalizeCpf(value);
    return cpf ? maskCpf(cpf) : '***.***.***-**';
  }

  if (normalizedKey.includes('email')) {
    return maskEmail(value);
  }

  if (isSensitiveKey(normalizedKey)) {
    return maskToken(value);
  }

  if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
    return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
  }

  return value;
}

function sanitizeForLog(value, key = '', depth = 0) {
  if (depth > MAX_DEPTH) {
    return '[MaxDepthReached]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      statusCode: value.statusCode
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, key, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized = {};
    Object.keys(value).forEach((objectKey) => {
      sanitized[objectKey] = sanitizeForLog(value[objectKey], objectKey, depth + 1);
    });
    return sanitized;
  }

  return sanitizePrimitiveByKey(key, value);
}

function writeLog(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    meta: sanitizeForLog(meta)
  };

  const serialized = JSON.stringify(entry);

  if (level === 'error') {
    console.error(serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

const logger = {
  info(message, meta = {}) {
    writeLog('info', message, meta);
  },
  warn(message, meta = {}) {
    writeLog('warn', message, meta);
  },
  error(message, meta = {}) {
    writeLog('error', message, meta);
  },
  audit(action, meta = {}) {
    writeLog('info', `audit:${action}`, meta);
  }
};

module.exports = {
  logger,
  sanitizeForLog,
  maskEmail,
  maskToken
};
