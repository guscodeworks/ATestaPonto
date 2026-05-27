'use strict';

const { Router } = require('express');
const { loginFuncionario } = require('../controllers/authController');
const rateLimiter = require('../middlewares/rateLimiter');

const router = Router();

router.post('/auth/funcionario/login', rateLimiter, loginFuncionario);

module.exports = router;
