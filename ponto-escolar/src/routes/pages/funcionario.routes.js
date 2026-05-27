'use strict';

const { Router } = require('express');

function createFuncionarioPagesRouter({ sendView }) {
  const router = Router();

  router.get('/funcionario', (_req, res) => sendView(res, 'funcionario/ponto.html'));
  router.get('/funcionario/perfil', (_req, res) => sendView(res, 'funcionario/perfil.html'));
  router.get('/funcionario/relatorio', (_req, res) => sendView(res, 'funcionario/relatorio.html'));

  return router;
}

module.exports = { createFuncionarioPagesRouter };

