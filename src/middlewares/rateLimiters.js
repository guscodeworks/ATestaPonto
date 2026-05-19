const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

function createLimiter(options) {
  const {
    name,
    windowMs,
    limit,
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options;

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,
    handler: (req, res) => {
      logger.warn('Rate limit reached', {
        limiter: name,
        ip: req.ip,
        method: req.method,
        path: req.originalUrl
      });

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Muitas requisicoes. Tente novamente em instantes'
        }
      });
    }
  });
}

const globalLimiter = createLimiter({
  name: 'global',
  windowMs: 15 * 60 * 1000,
  limit: 300
});

const loginLimiter = createLimiter({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true
});

const sensitiveLimiter = createLimiter({
  name: 'sensitive',
  windowMs: 15 * 60 * 1000,
  limit: 40
});

const pointLimiter = createLimiter({
  name: 'point',
  windowMs: 5 * 60 * 1000,
  limit: 20
});

module.exports = {
  createLimiter,
  globalLimiter,
  loginLimiter,
  sensitiveLimiter,
  pointLimiter
};
