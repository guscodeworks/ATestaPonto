'use strict';

const { Router } = require('express');
const homeController = require('../controllers/homeController');

const router = Router();

router.get('/', homeController.showHome);
router.get('/index.html', (_req, res) => res.redirect('/'));
router.get('/govbr', homeController.showGovbrPage);
router.get('/govbr.html', (_req, res) => res.redirect('/govbr'));
router.get('/service-info', homeController.showServiceInfo);

module.exports = router;
