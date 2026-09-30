const { Router } = require("express");
const {
  createEmployee,
  listEmployees,
  listRegistrationUnits,
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
  escopoPorCapacidade,
  exigirCapacidade,
  restringirCapacidadeFuncionario,
  restringirCapacidadeFuncionarioVisualizacao,
  restringirCapacidadeFuncionarioReativacao,
  restringirCapacidadeUnidadeDoBody,
} = require("../middlewares/adminScope");

const router = Router();

router.get(
  "/",
  escopoPorCapacidade("funcionario.listar"),
  paginationValidator,
  listEmployees
);
router.get(
  "/unidades",
  escopoPorCapacidade("funcionario.criar"),
  listRegistrationUnits
);
router.get(
  "/:id",
  employeeIdValidator,
  restringirCapacidadeFuncionarioVisualizacao("id"),
  getEmployee
);

router.post(
  "/",
  exigirCapacidade("funcionario.criar"),
  sensitiveLimiter,
  createFuncionarioValidator,
  restringirCapacidadeUnidadeDoBody(
    "funcionario.criar",
    "unidade_escolar_id"
  ),
  createEmployee
);
router.patch(
  "/:id",
  sensitiveLimiter,
  updateFuncionarioValidator,
  restringirCapacidadeFuncionario("funcionario.editar", "id"),
  updateEmployee
);
router.patch(
  "/:id/desativar",
  sensitiveLimiter,
  deactivateEmployeeValidator,
  restringirCapacidadeFuncionario("funcionario.desativar", "id"),
  deactivateEmployee
);
router.patch(
  "/:id/reativar",
  sensitiveLimiter,
  reactivateEmployeeValidator,
  restringirCapacidadeFuncionarioReativacao(
    "funcionario.reativar",
    "id"
  ),
  reactivateEmployee
);

module.exports = router;
