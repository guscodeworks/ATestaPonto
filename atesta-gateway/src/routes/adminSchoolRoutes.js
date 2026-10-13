"use strict";

const { Router } = require("express");
const {
  createSchool,
  previewSchool,
  listSchools,
  getSchool,
  listDiretorias,
  lookupCep,
} = require("../controllers/adminSchoolController");
const { sensitiveLimiter } = require("../middlewares/rateLimiters");
const {
  schoolIdValidator,
  schoolCepParamValidator,
  listSchoolsValidator,
} = require("../middlewares/validators");
const {
  escopoPorCapacidade,
  exigirCapacidade,
  restringirCapacidadeDiretoriaDoBody,
  restringirCapacidadeUnidadeDoParametro,
} = require("../middlewares/adminScope");

const router = Router();

// Rotas fixas antes de "/:id" para não serem lidas como id.
router.get(
  "/",
  escopoPorCapacidade("escola.listar"),
  listSchoolsValidator,
  listSchools
);
// DREs em que o administrador pode cadastrar (alimenta o seletor do formulário).
router.get("/diretorias", exigirCapacidade("escola.criar"), listDiretorias);
// Pré-visualiza o CEP (BrasilAPI) sem gravar nada.
router.get(
  "/cep/:cep",
  exigirCapacidade("escola.criar"),
  sensitiveLimiter,
  schoolCepParamValidator,
  lookupCep
);
router.get(
  "/:id",
  schoolIdValidator,
  restringirCapacidadeUnidadeDoParametro("escola.visualizar", "id"),
  getSchool
);

router.post(
  "/preview",
  restringirCapacidadeDiretoriaDoBody("escola.criar"),
  previewSchool
);

router.post(
  "/",
  exigirCapacidade("escola.criar"),
  sensitiveLimiter,
  restringirCapacidadeDiretoriaDoBody("escola.criar", "diretoria_ensino_id"),
  createSchool
);

module.exports = router;
