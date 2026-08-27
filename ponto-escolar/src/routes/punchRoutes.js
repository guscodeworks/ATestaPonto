const { Router } = require('express');
const { loginFuncionario, registerPunch } = require('../controllers/punchController');
const { requestRecovery, verifyRecoveryCode, resetPassword } = require('../controllers/passwordRecoveryController');
const { changeFirstAccessPassword } = require('../controllers/firstAccessPasswordController');
const { authenticateFuncionario } = require('../middlewares/authMiddleware');
const { loginLimiter, pointLimiter, sensitiveLimiter, passwordRecoveryLimiter } = require('../middlewares/rateLimiters');
const { baterPontoValidator, funcionarioLoginValidator, passwordRecoveryRequestValidator, passwordRecoveryCodeValidator, passwordRecoveryResetValidator } = require('../middlewares/validators');
const passwordRecoverySession = require('../middlewares/passwordRecoverySession');
const { MethodNotAllowedError } = require('../utils/errors');

const router = Router();

// Confirma o que foi levantado no router pai: authenticateFuncionario protege
// as rotas de registro de ponto neste nível, garantindo req.auth.id disponível
// nos controllers.
router.post('/login', loginLimiter, funcionarioLoginValidator, loginFuncionario);
router.post('/primeiro-acesso/trocar-senha', sensitiveLimiter, passwordRecoveryResetValidator, changeFirstAccessPassword);
router.use('/recuperar-senha', passwordRecoverySession);
router.post('/recuperar-senha/solicitar', passwordRecoveryLimiter, passwordRecoveryRequestValidator, requestRecovery);
router.post('/recuperar-senha/validar', sensitiveLimiter, passwordRecoveryCodeValidator, verifyRecoveryCode);
router.post('/recuperar-senha/redefinir', sensitiveLimiter, passwordRecoveryResetValidator, resetPassword);
router.post('/registrar', pointLimiter, authenticateFuncionario, baterPontoValidator, registerPunch);
router.post('/bater', pointLimiter, authenticateFuncionario, baterPontoValidator, registerPunch);

// router.all abaixo dos handlers POST só é alcançado para outros verbos
// (GET, PUT, DELETE etc.), já que uma requisição POST correspondente já teria
// sido tratada e finalizada pelos handlers acima. Usado para retornar um erro
// 405 claro em vez do 404 genérico do notFoundMiddleware.
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
