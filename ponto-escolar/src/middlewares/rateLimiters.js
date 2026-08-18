const rateLimit = require("express-rate-limit");
const env = require("../config/env");
const { logger } = require("../utils/logger");

function createLimiter(options) {
  const {
    name,
    windowMs,
    limit,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    skip,
  } = options;

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,
    skip,
    handler: (req, res) => {
      logger.warn("Rate limit reached", {
        limiter: name,
        ip: req.ip,
        method: req.method,
        path: req.originalUrl,
      });

      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Muitas requisicoes. Tente novamente em instantes",
        },
      });
    },
  });
}

// Exclui login/ponto do limitador global (têm pointLimiter/loginLimiter próprios).
function isPunchRegistrationRequest(req) {
  return (
    req.method === "POST" &&
    /^\/(api\/pontos|ponto)\/(login|registrar|bater)\/?$/.test(req.path)
  );
}

// Só logins falhos contam no limite (skipSuccessfulRequests).
const loginLimiter = createLimiter({
  name: "login",
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
});

const sensitiveLimiter = createLimiter({
  name: "sensitive",
  windowMs: 15 * 60 * 1000,
  limit: 40,
});

const passwordRecoveryLimiter = createLimiter({
  name: "password-recovery",
  windowMs: 15 * 60 * 1000,
  limit: 5,
});

// Limites de ponto configuráveis por instalação (env).
const pointLimiter = createLimiter({
  name: "point",
  windowMs: env.POINT_RATE_LIMIT_WINDOW_MS,
  limit: env.POINT_RATE_LIMIT_MAX,
});

module.exports = {
  createLimiter,
  loginLimiter,
  sensitiveLimiter,
  passwordRecoveryLimiter,
  pointLimiter,
};
