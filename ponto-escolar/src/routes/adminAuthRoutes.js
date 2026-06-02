const { Router } = require('express');
const { consultarSessaoAdmin } = require('../controllers/govbrAuth.controller');

const router = Router();

router.get('/me', consultarSessaoAdmin);

module.exports = router;
