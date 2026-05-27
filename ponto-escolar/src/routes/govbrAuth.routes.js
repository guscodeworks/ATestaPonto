'use strict';

const { Router } = require('express');
const {
  iniciarLoginGovbr,
  concluirLoginGovbr,
  sairGovbr
} = require('../controllers/govbrAuth.controller');

const router = Router();

router.get('/login', iniciarLoginGovbr);
router.get('/callback', concluirLoginGovbr);
router.get('/logout', sairGovbr);
router.post('/logout', sairGovbr);

module.exports = router;
