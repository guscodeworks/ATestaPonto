'use strict';

const { Router } = require('express');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { executeOne } = require('../../config/database');
const { buildClearAdminAuthCookie, getAdminAuthCookie } = require('../../utils/authCookie');

function redirectToAdminLogin(res) {
  res.setHeader('Set-Cookie', buildClearAdminAuthCookie());
  return res.redirect('/admin/login');
}

async function requireAdminPageAuth(req, res, next) {
  try {
    const token = getAdminAuthCookie(req);

    if (!token) {
      return redirectToAdminLogin(res);
    }

    const payload = jwt.verify(token, env.JWT_SECRET);
    const adminId = Number(payload.id || payload.sub || 0);

    if (payload.role !== 'admin' || !Number.isInteger(adminId) || adminId <= 0) {
      return redirectToAdminLogin(res);
    }

    const admin = await executeOne('SELECT id FROM admins WHERE id = ? AND ativo = 1 LIMIT 1', [adminId]);

    if (!admin) {
      return redirectToAdminLogin(res);
    }

    req.auth = {
      id: adminId,
      role: 'admin'
    };

    return next();
  } catch (_error) {
    return redirectToAdminLogin(res);
  }
}

function createAdminPagesRouter({ sendView }) {
  const router = Router();

  router.get('/admin', requireAdminPageAuth, (_req, res) => res.redirect('/admin/dashboard'));
  router.get('/admin/login', (_req, res) => {
    res.setHeader('Set-Cookie', buildClearAdminAuthCookie());
    return sendView(res, 'admin/login_adm.html');
  });
  router.get('/admin/dashboard', requireAdminPageAuth, (_req, res) => sendView(res, 'admin/dashboard.html'));
  router.get('/admin/funcionarios', requireAdminPageAuth, (_req, res) => sendView(res, 'admin/funcionarios.html'));
  router.get('/admin/funcionarios/novo', requireAdminPageAuth, (_req, res) => sendView(res, 'admin/registrar-funcionario.html'));
  router.get('/admin/pontos-do-dia', requireAdminPageAuth, (_req, res) => sendView(res, 'admin/pontos-do-dia.html'));
  router.get('/admin/relatorios', requireAdminPageAuth, (_req, res) => sendView(res, 'admin/relatorios.html'));
  router.get('/admin/configuracoes', requireAdminPageAuth, (_req, res) => sendView(res, 'admin/configuracoes.html'));

  return router;
}

module.exports = { createAdminPagesRouter };

