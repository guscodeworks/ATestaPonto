const { Router } = require("express");
const {
  getTodayPoints,
  getDailyReport,
  getDashboardSummary,
  getHierarchicalReport,
} = require("../controllers/adminPointController");
const { sensitiveLimiter } = require("../middlewares/rateLimiters");
const { escopoPorCapacidade } = require("../middlewares/adminScope");

const router = Router();

router.get(
  "/relatorio/hierarquia",
  escopoPorCapacidade("relatorio.visualizar"),
  sensitiveLimiter,
  getHierarchicalReport
);

router.get(
  "/hoje",
  escopoPorCapacidade("ponto.hoje.visualizar"),
  sensitiveLimiter,
  getTodayPoints
);
router.get(
  "/relatorio",
  escopoPorCapacidade("relatorio.visualizar"),
  sensitiveLimiter,
  getDailyReport
);
router.get(
  "/resumo",
  escopoPorCapacidade("ponto.resumo.visualizar"),
  sensitiveLimiter,
  getDashboardSummary
);

module.exports = router;
