'use strict';

const { Router } = require('express');
const govbrAuthController = require('../controllers/govbrAuthController');

const router = Router();

router.get('/authorize', govbrAuthController.showAuthorize);
router.post('/login', govbrAuthController.login);
router.post('/token', govbrAuthController.exchangeToken);
router.get('/userinfo', govbrAuthController.showUserInfo);

module.exports = router;
