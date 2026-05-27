const { Router } = require('express');
const {
  createEmployee,
  listEmployees,
  updateEmployee,
  setEmployeeStatus
} = require('../controllers/adminEmployeeController');
const { sensitiveLimiter } = require('../middlewares/rateLimiters');
const {
  createFuncionarioValidator,
  updateFuncionarioValidator,
  funcionarioStatusValidator,
  paginationValidator
} = require('../middlewares/validators');

const router = Router();

router.get('/', paginationValidator, listEmployees);
router.post('/', sensitiveLimiter, createFuncionarioValidator, createEmployee);
router.patch('/:id', sensitiveLimiter, updateFuncionarioValidator, updateEmployee);
router.patch('/:id/status', sensitiveLimiter, funcionarioStatusValidator, setEmployeeStatus);

module.exports = router;
