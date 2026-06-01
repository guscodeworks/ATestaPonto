'use strict';

const { env } = require('../config/env');

function showServiceInfo(_req, res) {
  return res.status(200).json({
    success: true,
    service: 'gov.br-fake',
    environment: env.environmentLabel,
    message: 'Gov.br fake local rodando. Ambiente apenas para demonstracao.',
    routes: {
      health: '/health',
      authorize: '/fake-govbr/authorize',
      token: '/fake-govbr/token',
      userinfo: '/fake-govbr/userinfo'
    }
  });
}

module.exports = {
  showServiceInfo
};
