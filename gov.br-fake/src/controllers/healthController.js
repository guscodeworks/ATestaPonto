'use strict';

const { env } = require('../config/env');

function showHealth(_req, res) {
  return res.status(200).json({
    success: true,
    service: 'gov.br-fake',
    environment: env.environmentLabel,
    production: false,
    baseUrl: `http://${env.host}:${env.port}`,
    message: 'gov.br-fake rodando em ambiente local e demonstrativo.'
  });
}

module.exports = {
  showHealth
};
