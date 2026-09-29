const { maskCpf, normalizeCpf } = require('./cpf');
const { isIP } = require('node:net');

const MAX_STRING_LENGTH = 2000;
const MAX_DEPTH = 6;

function maskEmail() {
  return '[REDACTED_EMAIL]';
}

function maskToken() {
  return '[REDACTED_TOKEN]';
}

function isSensitiveKey(key) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    ['code', 'authcode', 'codigo', 'recoverycode', 'state', 'qr', 'qrcode',
      'query', 'querystring', 'params', 'path', 'url', 'originalurl', 'referer', 'referrer',
      'headers', 'body', 'request', 'req', 'response', 'res', 'session',
      'message', 'stack', 'cause', 'errordescription'].includes(normalized) ||
    normalized.includes('login') ||
    normalized.includes('email') ||
    normalized.includes('qr') ||
    normalized.includes('url') ||
    normalized.includes('verifier') ||
    normalized.includes('challenge') ||
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

  if (normalizedKey === 'ip' || normalizedKey === 'iporigem') {
    return typeof value === 'string' && isIP(value) ? value : '[InvalidIP]';
  }

  if (normalizedKey.includes('cpf')) {
    const cpf = normalizeCpf(value);
    return cpf ? maskCpf(cpf) : '***.***.***-**';
  }

  // Defense in depth for common secrets embedded in unstructured text.
  if (typeof value === 'string' && (
    /[^\s@]+@[^\s@]+/.test(value) ||
    /(?:https?:\/\/\S*\?|[?&][^\s=]+=|\b(?:bearer|basic)\s+|(?:token|password|senha|cookie|authorization|login|code|state)\s*[:=])/i.test(value)
  )) {
    return '[REDACTED]';
  }

  if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
    return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
  }

  return value;
}

function sanitizeForLog(value, key = '', depth = 0) {
  // Logging must never fail because of null, cycles, getters, proxies or BigInt.
  try {
    key = typeof key === 'string' ? key : '';
    depth = Number.isInteger(depth) && depth >= 0 ? depth : 0;
    if (depth > MAX_DEPTH) {
      return '[MaxDepthReached]';
    }

    if (isSensitiveKey(key)) {
      return '[REDACTED]';
    }

    if (value === null || value === undefined) {
      return value;
    }

    if (value instanceof Error) {
      return safeErrorContext(value);
    }
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      return '[Binary]';
    }

    if (Array.isArray(value)) {
      const sanitized = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        sanitized.push(descriptor && 'value' in descriptor
          ? sanitizeForLog(descriptor.value, key, depth + 1) : '[Unreadable]');
      }
      return sanitized;
    }

    if (typeof value === 'object') {
      const sanitized = Object.create(null);
      Object.keys(value).forEach((objectKey) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, objectKey);
        sanitized[objectKey] = descriptor && 'value' in descriptor
          ? sanitizeForLog(descriptor.value, objectKey, depth + 1)
          : '[Unreadable]';
      });
      return sanitized;
    }

    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'function' || typeof value === 'symbol') return '[Unsupported]';
    return sanitizePrimitiveByKey(key, value);
  } catch (_error) {
    return '[Unserializable]';
  }
}

// Never copy provider messages, SQL, stack, cause or arbitrary error properties.
const SAFE_ERROR_CODES = new Set([
  'INTERNAL_ERROR', 'BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND',
  'METHOD_NOT_ALLOWED', 'CONFLICT', 'VALIDATION_ERROR', 'RATE_LIMITED',
  'DATABASE_ERROR', 'REQUEST_ERROR', 'CORS_ORIGIN_BLOCKED',
  'ER_DUP_ENTRY', 'ER_NO_REFERENCED_ROW_2', 'ER_NO_DEFAULT_FOR_FIELD',
  'ER_ROW_IS_REFERENCED_2', 'ER_DATA_TOO_LONG', 'ER_TRUNCATED_WRONG_VALUE',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND',
  'EAUTH', 'EENVELOPE', 'EMESSAGE', 'ESOCKET', 'ECONNECTION', 'EDNS',
  'OAUTH_UPSTREAM_ERROR', 'OAUTH_INVALID_RESPONSE', 'OAUTH_NETWORK_ERROR',
]);

function safeErrorContext(error) {
  try {
    const code = error?.code;
    const status = error?.statusCode ?? error?.status;
    return {
      errorCode: SAFE_ERROR_CODES.has(code) ? code : 'UNCLASSIFIED_ERROR',
      statusCode: Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined,
      operation: ['token_exchange', 'userinfo'].includes(error?.operation) ? error.operation : undefined,
      upstreamStatus: Number.isInteger(error?.upstreamStatus) ? error.upstreamStatus : undefined,
    };
  } catch (_error) {
    return { errorCode: 'UNCLASSIFIED_ERROR' };
  }
}

function safeRequestContext(req) {
  const path = typeof req.originalUrl === 'string' ? req.originalUrl.split('?')[0] : '';
  const area = [
    ['/auth/govbr', 'oauth'], ['/api/pontos', 'punch'], ['/ponto', 'punch'],
    ['/api/admin', 'admin'], ['/admin', 'admin'],
  ].find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return {
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method)
      ? req.method : 'OTHER',
    // route.path is the declared Express template, never the requested URL/params.
    route: typeof req.route?.path === 'string' ? req.route.path : '[unmatched]',
    area: area ? area[1] : 'http',
  };
}

function writeLog(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: sanitizeForLog(message),
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
  maskToken,
  safeErrorContext,
  safeRequestContext
};
