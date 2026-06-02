'use strict';

const { Router } = require('express');
const healthController = require('../controllers/healthController');

const router = Router();

router.get('/', healthController.showHealth);

module.exports = router;
