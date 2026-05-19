const { Router } = require('express');
const { registerPunch } = require('../controllers/punchController');
const { pointLimiter } = require('../middlewares/rateLimiters');
const { baterPontoValidator } = require('../middlewares/validators');
const { MethodNotAllowedError } = require('../utils/errors');

const router = Router();

router.post('/bater', pointLimiter, baterPontoValidator, registerPunch);
router.all('/bater', (req, _res, next) => {
  next(
    new MethodNotAllowedError('Metodo nao permitido para /api/pontos/bater. Use POST.', {
      allowedMethods: ['POST']
    })
  );
});

module.exports = router;
