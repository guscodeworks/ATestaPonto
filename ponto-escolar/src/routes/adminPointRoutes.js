const { Router } = require("express");
const {
  getTodayPoints,
  getDailyReport,
  getDashboardSummary,
} = require("../controllers/adminPointController");
const { sensitiveLimiter } = require("../middlewares/rateLimiters");
const { escopoMiddleware } = require("../middlewares/adminScope");

const router = Router();

router.use(escopoMiddleware);

router.get("/hoje", sensitiveLimiter, getTodayPoints);
router.get("/relatorio", sensitiveLimiter, getDailyReport);
router.get("/resumo", sensitiveLimiter, getDashboardSummary);

module.exports = router;
