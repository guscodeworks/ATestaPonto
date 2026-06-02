const { Router } = require('express');
const {
  generateQrToken,
  listQrTokens,
  deactivateQrToken,
  validateQrToken
} = require('../controllers/adminQrController');
const { sensitiveLimiter } = require('../middlewares/rateLimiters');
const {
  qrTokenIdParamValidator,
  validateQrTokenValidator,
  paginationValidator
} = require('../middlewares/validators');

const router = Router();

router.get('/', paginationValidator, listQrTokens);
router.post('/', sensitiveLimiter, generateQrToken);
router.patch('/:id/desativar', sensitiveLimiter, qrTokenIdParamValidator, deactivateQrToken);
router.post('/validar', sensitiveLimiter, validateQrTokenValidator, validateQrToken);

module.exports = router;
