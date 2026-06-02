'use strict';

/**
 * Extrai o IP real do cliente levando em conta proxies (X-Forwarded-For).
 * Reutilizado por adminAuthController, adminPointController e punchController.
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() ||
    req.ip ||
    null
  );
}

/**
 * Extrai e trunca o User-Agent da requisição.
 */
function getClientUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 255) || null;
}

module.exports = { getClientIp, getClientUserAgent };
