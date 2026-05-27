'use strict';

const { Router } = require('express');
const { createAuthPagesRouter } = require('./auth.routes');
const { createAdminPagesRouter } = require('./admin.routes');
const { createFuncionarioPagesRouter } = require('./funcionario.routes');
const { createLegacyPagesRouter } = require('./legacy.routes');

function createPagesRouter({ sendView, validateQrCode, schoolUnitCode, noCacheHtmlHeaders }) {
  const router = Router();

  router.use(createAuthPagesRouter({ sendView }));
  router.use(createFuncionarioPagesRouter({ sendView }));
  router.use(createAdminPagesRouter({ sendView }));

  router.get('/ponto', (_req, res) => {
    res.redirect('/ponto/acessar');
  });

  router.get('/bater-ponto', (_req, res) => {
    res.redirect('/ponto/acessar');
  });

  router.get('/ponto/acessar', async (req, res) => {
    const qrCode = String(req.query.qr_code || '').trim();
    const unidadeCodigo = String(req.query.unidade_codigo || '').trim();
    const validation = await validateQrCode(qrCode, { unidadeCodigo: unidadeCodigo || schoolUnitCode });

    if (!validation.valid) {
      res.set(noCacheHtmlHeaders);
      res.status(403).type('html').send(
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Acesso</title></head><body><h1>Acesso invalido ou expirado</h1><p>Solicite um novo acesso.</p></body></html>'
      );
      return;
    }

    sendView(res, 'index.html');
  });

  router.use(createLegacyPagesRouter());

  return router;
}

module.exports = { createPagesRouter };

