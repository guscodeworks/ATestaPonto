'use strict';

/**
 * Extrai o IP real do cliente levando em conta proxies (X-Forwarded-For).
 * Reutilizado por adminPointController e punchController.
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() ||
    req.ip ||
    {}
  );
}

/**
 * Extrai e trunca o User-Agent da requisição.
 */
function getClientUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 255) || {};
}

module.exports = { getClientIp, getClientUserAgent };
