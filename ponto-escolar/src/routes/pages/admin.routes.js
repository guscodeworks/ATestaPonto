'use strict';

const { Router } = require('express');

function createAdminPagesRouter({ sendView }) {
  const router = Router();

  router.get('/admin', (_req, res) => res.redirect('/admin/dashboard'));
  router.get('/admin/login', (_req, res) => sendView(res, 'admin/login_adm.html'));
  router.get('/admin/dashboard', (_req, res) => sendView(res, 'admin/dashboard.html'));
  router.get('/admin/funcionarios', (_req, res) => sendView(res, 'admin/funcionarios.html'));
  router.get('/admin/funcionarios/novo', (_req, res) => sendView(res, 'admin/registrar-funcionario.html'));
  router.get('/admin/pontos-do-dia', (_req, res) => sendView(res, 'admin/pontos-do-dia.html'));
  router.get('/admin/relatorios', (_req, res) => sendView(res, 'admin/relatorios.html'));
  router.get('/admin/configuracoes', (_req, res) => sendView(res, 'admin/configuracoes.html'));

  return router;
}

module.exports = { createAdminPagesRouter };

