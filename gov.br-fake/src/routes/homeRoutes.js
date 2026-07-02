'use strict';

const { Router } = require('express');
const homeController = require('../controllers/homeController');

const router = Router();

router.get('/', homeController.showHome);
// Alias para compatibilidade com links/bookmarks que apontem diretamente para "index.html".
router.get('/index.html', homeController.showHome);
router.get('/govbr', homeController.showGovbrPage);
// Normaliza a URL removendo a extensão ".html", mantendo "/govbr" como rota canônica.
router.get('/govbr.html', (_req, res) => res.redirect('/govbr'));
router.get('/visual', (_req, res) => res.redirect('/visual.html'));
router.get('/visual.html', homeController.showVisualPage);
// Path replicado propositalmente para imitar a URL real do painel administrativo do
// Ponto Escolar, mantendo a experiência de navegação consistente com o sistema simulado.
router.get('/views/admin/dashboard.html', homeController.startPontoEscolarAdmin);
router.get('/service-info', homeController.showServiceInfo);

module.exports = router;