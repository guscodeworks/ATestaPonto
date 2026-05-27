'use strict';

const rateLimit = require('express-rate-limit');

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    return res.status(429).json({ message: 'Muitas tentativas. Tente novamente em 15 minutos.' });
  }
});

module.exports = rateLimiter;
