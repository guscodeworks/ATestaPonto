"use strict";

const { isIP } = require("node:net");
const { ipKeyGenerator } = require("express-rate-limit");
const env = require("../config/env");
const store = require("../config/redisRateLimitStore");
const { digestSubject, loginSubject } = require("../utils/rateLimitSubject");
const { logger, safeRequestContext, safeErrorContext } = require("../utils/logger");

function ipSubject(req) {
  let ip = isIP(req.ip || "") ? req.ip : req.socket?.remoteAddress;
  if (ip?.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return isIP(ip || "") ? ipKeyGenerator(ip, 56) : "unknown-ip";
}

function createLimiter({ name, windowMs, limit, keyGenerator = ipSubject, skipSuccessfulRequests = false, countOnFailure = false }) {
  if (!/^[a-z][a-z_-]*$/.test(name) || !Number.isSafeInteger(windowMs) || windowMs <= 0 ||
      !Number.isSafeInteger(limit) || limit <= 0) throw new Error("Invalid rate limit configuration");
  return async function distributedRateLimit(req, res, next) {
    let reservation;
    let digest;
    try {
      digest = digestSubject(keyGenerator(req));
      reservation = await (countOnFailure ? store.read : store.increment)(name, digest, windowMs);
    } catch (error) {
      logger.error("Rate limit storage unavailable", { limiter: name, error: safeErrorContext(error) });
      return res.status(503).json({ success: false, error: {
        code: "RATE_LIMIT_UNAVAILABLE", message: "Protecao temporariamente indisponivel. Tente novamente em instantes.",
      } });
    }
    const resetSeconds = Math.max(1, Math.ceil((reservation.ttl || windowMs) / 1000));
    res.append("RateLimit", `"${name}"; r=${Math.max(0, limit - reservation.hits)}; t=${resetSeconds}`);
    res.append("RateLimit-Policy", `"${name}"; q=${limit}; w=${Math.ceil(windowMs / 1000)}`);
    if (countOnFailure ? reservation.hits >= limit : reservation.hits > limit) {
      res.set("Retry-After", String(resetSeconds));
      logger.warn("Rate limit reached", { limiter: name, ...safeRequestContext(req), statusCode: 429 });
      return res.status(429).json({ success: false, error: {
        code: "RATE_LIMITED", message: "Muitas requisicoes. Tente novamente em instantes",
      } });
    }
    if (countOnFailure) {
      // Não reserva vagas de falha para uma fila de logins legítimos do mesmo NAT.
      // A cota total de IP e a reserva por identidade limitam requisições em voo.
      res.once("finish", () => {
        if (res.statusCode >= 400) {
          void store.increment(name, digest, windowMs).catch(error => {
            logger.error("Rate limit failure accounting failed", { limiter: name, error: safeErrorContext(error) });
          });
        }
      });
    } else if (skipSuccessfulRequests) {
      res.once("finish", () => {
        if (res.statusCode < 400) {
          void store.refund(reservation).catch(error => {
            // Falha no desconto é conservadora: não libera tentativas extras.
            logger.error("Rate limit refund failed", { limiter: name, error: safeErrorContext(error) });
          });
        }
      });
    }
    return next();
  };
}

const WINDOW_MS = 15 * 60 * 1000;
// Protege inclusive a autenticação; teto amplo, compartilhado entre endpoints.
const ipAbuseLimiter = createLimiter({
  name: "ip-abuse", windowMs: WINDOW_MS, limit: env.RATE_LIMIT_IP_MAX,
});

const loginLimiter = [
  ipAbuseLimiter,
  createLimiter({ name: "login-ip-failure", windowMs: WINDOW_MS,
    limit: env.LOGIN_RATE_LIMIT_IP_FAILURE_MAX, countOnFailure: true }),
  createLimiter({ name: "login-identity", windowMs: WINDOW_MS, limit: 5,
    keyGenerator: req => loginSubject(req.body), skipSuccessfulRequests: true }),
];

function sensitiveSubject(req) {
  if (req.auth?.role === "admin") return `admin:${req.auth.id}`;
  if (req.auth?.role === "funcionario") return `employee:${req.auth.id}`;
  // Mesmo identificador para contas existentes/inexistentes; nunca usa employeeId.
  return req.session?.passwordRecovery?.rateLimitSubject
    ? `recovery:${req.session.passwordRecovery.rateLimitSubject}`
    : `session:${req.sessionID || ipSubject(req)}`;
}

const sensitiveLimiter = [
  ipAbuseLimiter,
  createLimiter({ name: "sensitive", windowMs: WINDOW_MS, limit: 40, keyGenerator: sensitiveSubject }),
  createLimiter({ name: "sensitive-resource", windowMs: WINDOW_MS, limit: 40,
    keyGenerator: req => [sensitiveSubject(req), req.auth ? req.baseUrl : "recovery",
      req.route?.path || "unknown", String(req.params?.id || "")] }),
];

const passwordRecoveryLimiter = [
  ipAbuseLimiter,
  createLimiter({ name: "password-recovery", windowMs: WINDOW_MS, limit: 5,
    keyGenerator: req => loginSubject({ cpf: req.body?.cpf }) }),
];

// Após authenticateFuncionario: claims não verificadas não formam a chave.
const pointLimiter = createLimiter({
  name: "point", windowMs: env.POINT_RATE_LIMIT_WINDOW_MS, limit: env.POINT_RATE_LIMIT_MAX,
  keyGenerator: req => {
    if (req.auth?.role !== "funcionario" || !req.auth.id) throw new Error("Missing authenticated employee");
    return `employee:${req.auth.id}`;
  },
});

module.exports = { createLimiter, ipAbuseLimiter, loginLimiter, sensitiveLimiter, passwordRecoveryLimiter, pointLimiter };
