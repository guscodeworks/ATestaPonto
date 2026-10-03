const { Router } = require("express");
const {
  getCurrentQr,
  generateQr,
} = require("../controllers/adminQrController");
const { sensitiveLimiter } = require("../middlewares/rateLimiters");
const {
  restringirCapacidadeQrUnidade,
} = require("../middlewares/adminScope");

const router = Router();

router.get(
  "/",
  restringirCapacidadeQrUnidade("qr.visualizar"),
  getCurrentQr
);
router.post(
  "/",
  sensitiveLimiter,
  restringirCapacidadeQrUnidade("qr.gerar"),
  generateQr
);

module.exports = router;
