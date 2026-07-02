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

// Identifica requisições de login/registro de ponto para que fiquem de fora do
// limitador global, já que possuem seu próprio limitador dedicado (pointLimiter/loginLimiter)
// com regras mais adequadas ao volume de uso desses endpoints.
function isPunchRegistrationRequest(req) {
  return (
    req.method === "POST" &&
    /^\/(api\/pontos|ponto)\/(login|registrar|bater)\/?$/.test(req.path)
  );
}

const globalLimiter = createLimiter({
  name: "global",
  windowMs: 15 * 60 * 1000,
  limit: 300,
  skip: isPunchRegistrationRequest,
});

// skipSuccessfulRequests garante que apenas tentativas de login malsucedidas contem
// para o limite, evitando bloquear um funcionário que faz login legitimamente várias vezes.
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

// Limites configuráveis via ambiente pois o volume esperado de registros de ponto
// varia conforme o tamanho da base de funcionários de cada instalação.
const pointLimiter = createLimiter({
  name: "point",
  windowMs: env.POINT_RATE_LIMIT_WINDOW_MS,
  limit: env.POINT_RATE_LIMIT_MAX,
});

module.exports = {
  createLimiter,
  globalLimiter,
  loginLimiter,
  sensitiveLimiter,
  pointLimiter,
};