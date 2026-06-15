const { Router } = require("express");
const {
  generateQrShortcut,
  listQrShortcuts,
  deactivateQrShortcut,
  validateQrShortcut,
} = require("../controllers/adminQrController");
const { sensitiveLimiter } = require("../middlewares/rateLimiters");
const {
  qrShortcutIdParamValidator,
  validateQrShortcutValidator,
  paginationValidator,
} = require("../middlewares/validators");

const router = Router();

router.get("/", paginationValidator, listQrShortcuts);
router.post("/", sensitiveLimiter, generateQrShortcut);
router.patch(
  "/:id/desativar",
  sensitiveLimiter,
  qrShortcutIdParamValidator,
  deactivateQrShortcut
);
router.post(
  "/validar",
  sensitiveLimiter,
  validateQrShortcutValidator,
  validateQrShortcut
);

module.exports = router;
