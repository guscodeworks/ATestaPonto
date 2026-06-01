'use strict';

const path = require('path');
const { env } = require('../config/env');

const viewsRoot = path.resolve(__dirname, '../../views');

function sendView(res, relativePath) {
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
  });
  return res.sendFile(path.join(viewsRoot, relativePath));
}

function showHome(_req, res) {
  return sendView(res, 'page/index.html');
}

function showGovbrPage(_req, res) {
  return sendView(res, 'page/govbr.html');
}

function showServiceInfo(_req, res) {
  return res.status(200).json({
    success: true,
    service: 'gov.br-fake',
    environment: env.environmentLabel,
    message: 'Gov.br fake local rodando. Ambiente apenas para demonstracao.',
    routes: {
      home: '/',
      govbr: '/govbr',
      health: '/health',
      authorize: '/fake-govbr/authorize',
      token: '/fake-govbr/token',
      userinfo: '/fake-govbr/userinfo',
      gerenciarPontos: env.pontoEscolarStartUrl
    }
  });
}

module.exports = {
  showHome,
  showGovbrPage,
  showServiceInfo
};
