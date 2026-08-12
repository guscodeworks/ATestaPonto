const { Router } = require("express");
const {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  deactivateEmployee,
  reactivateEmployee,
} = require("../controllers/adminEmployeeController");
const { sensitiveLimiter } = require("../middlewares/rateLimiters");
const {
  createFuncionarioValidator,
  employeeIdValidator,
  updateFuncionarioValidator,
  deactivateEmployeeValidator,
  reactivateEmployeeValidator,
  paginationValidator,
} = require("../middlewares/validators");
const {
  escopoMiddleware,
  restringirEscopoFuncionario,
  restringirEscopoUnidadeDoBody,
} = require("../middlewares/adminScope");

const router = Router();

router.use(escopoMiddleware);

router.get("/", paginationValidator, listEmployees);
router.get("/:id", employeeIdValidator, restringirEscopoFuncionario("id"), getEmployee);
router.post(
  "/",
  sensitiveLimiter,
  createFuncionarioValidator,
  restringirEscopoUnidadeDoBody("unidade_escolar_id"),
  createEmployee
);
router.patch(
  "/:id",
  sensitiveLimiter,
  updateFuncionarioValidator,
  restringirEscopoFuncionario("id"),
  updateEmployee
);
router.patch(
  "/:id/desativar",
  sensitiveLimiter,
  deactivateEmployeeValidator,
  restringirEscopoFuncionario("id"),
  deactivateEmployee
);
router.patch(
  "/:id/reativar",
  sensitiveLimiter,
  reactivateEmployeeValidator,
  restringirEscopoFuncionario("id"),
  reactivateEmployee
);

module.exports = router;
