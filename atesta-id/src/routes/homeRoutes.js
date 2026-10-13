'use strict';

const { Router } = require('express');
const homeController = require('../controllers/homeController');
const govbrAuthController = require('../controllers/govbrAuthController');

const router = Router();

router.get('/', homeController.showHome);
router.get('/auth/login', homeController.showLoginPage);
router.get('/auth/dashboard', homeController.showDashboardPage);
router.get('/auth/continue', homeController.continueToPontoEscolar);
router.get('/auth/logout', govbrAuthController.logout);
router.get('/service-info', homeController.showServiceInfo);

module.exports = router;
