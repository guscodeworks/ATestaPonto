const { Router } = require('express');
const { loginFuncionario, registerPunch } = require('../controllers/punchController');
const { authenticateFuncionario } = require('../middlewares/authMiddleware');
const { pointLimiter } = require('../middlewares/rateLimiters');
const { baterPontoValidator, funcionarioLoginValidator } = require('../middlewares/validators');
const { MethodNotAllowedError } = require('../utils/errors');

const router = Router();

router.post('/login', pointLimiter, funcionarioLoginValidator, loginFuncionario);
router.post('/registrar', pointLimiter, authenticateFuncionario, baterPontoValidator, registerPunch);
router.post('/bater', pointLimiter, authenticateFuncionario, baterPontoValidator, registerPunch);
router.all('/bater', (req, _res, next) => {
  next(
    new MethodNotAllowedError('Metodo nao permitido para bater ponto. Use POST.', {
      allowedMethods: ['POST']
    })
  );
});
router.all('/login', (req, _res, next) => {
  next(new MethodNotAllowedError('Metodo nao permitido para login de funcionario. Use POST.', { allowedMethods: ['POST'] }));
});
router.all('/registrar', (req, _res, next) => {
  next(new MethodNotAllowedError('Metodo nao permitido para registrar ponto. Use POST.', { allowedMethods: ['POST'] }));
});

module.exports = router;
