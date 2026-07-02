'use strict';

const { env } = require('../config/env');

function showHealth(_req, res) {
  return res.status(200).json({
    success: true,
    service: 'gov.br-fake',
    environment: env.environmentLabel,
    // Sempre "false": este serviço é, por definição, um simulador do govbr e nunca
    // deve ser confundido com o ambiente de produção real, independente do env atual.
    production: false,
    // Assume esquema "http" fixo; não reflete caso o serviço seja exposto via HTTPS
    // (ex.: atrás de um proxy/load balancer com TLS).
    baseUrl: `http://${env.host}:${env.port}`,
    message: 'gov.br-fake rodando em ambiente local e demonstrativo.'
  });
}

module.exports = {
  showHealth
};