'use strict';

const { Router } = require('express');
const {
  iniciarLoginGovbr,
  concluirLoginGovbr,
  sairGovbr
} = require('../controllers/govbrAuth.controller');
const requireSameOrigin = require('../middlewares/requireSameOrigin');

const router = Router();

router.get('/start', (_req, res) => res.redirect('/auth/govbr/login'));
router.get('/login', iniciarLoginGovbr);
router.get('/callback', concluirLoginGovbr);
router.post('/logout', requireSameOrigin, sairGovbr);

module.exports = router;
