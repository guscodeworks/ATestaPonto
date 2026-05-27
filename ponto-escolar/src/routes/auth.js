'use strict';

const { Router } = require('express');
const { loginAdmin, loginFuncionario, logoutAdmin } = require('../controllers/authController');
const rateLimiter = require('../middlewares/rateLimiter');

const router = Router();

router.post('/auth/admin/logout', logoutAdmin);
router.post('/auth/funcionario/login', rateLimiter, loginFuncionario);

module.exports = router;
