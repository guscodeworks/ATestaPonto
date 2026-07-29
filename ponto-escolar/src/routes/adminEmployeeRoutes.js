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

const router = Router();

router.get("/", paginationValidator, listEmployees);
router.get("/:id", employeeIdValidator, getEmployee);
router.post("/", sensitiveLimiter, createFuncionarioValidator, createEmployee);
router.patch(
  "/:id",
  sensitiveLimiter,
  updateFuncionarioValidator,
  updateEmployee
);
router.patch(
  "/:id/desativar",
  sensitiveLimiter,
  deactivateEmployeeValidator,
  deactivateEmployee
);
router.patch(
  "/:id/reativar",
  sensitiveLimiter,
  reactivateEmployeeValidator,
  reactivateEmployee
);

module.exports = router;
