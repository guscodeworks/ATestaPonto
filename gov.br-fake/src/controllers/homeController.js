'use strict';

const path = require('path');
const { env } = require('../config/env');
const { getAuthenticatedUser } = require('./govbrAuthController');

const viewsRoot = path.resolve(__dirname, '../../views');

// Envia uma view estática sempre com headers de no-cache, garantindo que o navegador
// não guarde em cache páginas sensíveis ao estado de autenticação (login/logout).
function sendView(res, relativePath) {
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
  });
  return res.sendFile(path.join(viewsRoot, relativePath));
}

async function showHome(req, res, next) {
  try {
    // Usuário já autenticado não deve ver a home/landing novamente; vai direto para a
    // área logada.
    if (await getAuthenticatedUser(req)) {
      res.set({
        'Cache-Control': 'no-store, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      });
      return res.redirect(303, '/visual.html');
    }

    return sendView(res, 'page/index.html');
  } catch (error) {
    return next(error);
  }
}

function showGovbrPage(_req, res) {
  return sendView(res, 'page/govbr.html');
}

async function showVisualPage(req, res, next) {
  try {
    // Área logada: exige sessão fake válida, senão volta para a tela de login simulada.
    if (!(await getAuthenticatedUser(req))) {
      return res.redirect('/govbr');
    }

    return sendView(res, 'page/visual.html');
  } catch (error) {
    return next(error);
  }
}

async function startPontoEscolarAdmin(req, res, next) {
  try {
    // Ponto de entrada para o sistema externo "Ponto Escolar": exige autenticação
    // prévia neste provedor fake antes de redirecionar.
    if (!(await getAuthenticatedUser(req))) {
      return res.redirect('/govbr');
    }

    return res.redirect(env.pontoEscolarStartUrl);
  } catch (error) {
    return next(error);
  }
}

// Endpoint informativo, útil para descobrir rapidamente todas as rotas expostas
// por este simulador durante o desenvolvimento/integração.
function showServiceInfo(_req, res) {
  return res.status(200).json({
    success: true,
    service: 'gov.br-fake',
    environment: env.environmentLabel,
    message: 'Gov.br fake local rodando. Ambiente apenas para demonstracao.',
    routes: {
      home: '/',
      govbr: '/govbr',
      visual: '/visual.html',
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
  showVisualPage,
  startPontoEscolarAdmin,
  showServiceInfo
};
