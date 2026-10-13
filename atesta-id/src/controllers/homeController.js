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

function showHome(_req, res) {
  return res.redirect('/auth/login');
}

async function showLoginPage(req, res, next) {
  try {
    if (await getAuthenticatedUser(req)) {
      return res.redirect('/auth/dashboard');
    }

    return sendView(res, 'page/govbr.html');
  } catch (error) {
    return next(error);
  }
}

async function showDashboardPage(req, res, next) {
  try {
    if (!(await getAuthenticatedUser(req))) {
      return res.redirect('/auth/login');
    }

    return sendView(res, 'page/visual.html');
  } catch (error) {
    return next(error);
  }
}

async function continueToPontoEscolar(req, res, next) {
  try {
    if (!(await getAuthenticatedUser(req))) {
      return res.redirect('/auth/login');
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
    service: 'Simulador de Identidade — ATestaPonto',
    environment: env.environmentLabel,
    message: 'Provedor generico de identidade em ambiente academico de demonstracao.',
    routes: {
      home: '/',
      login: '/auth/login',
      dashboard: '/auth/dashboard',
      continue: '/auth/continue',
      logout: '/auth/logout',
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
  showLoginPage,
  showDashboardPage,
  continueToPontoEscolar,
  showServiceInfo
};
