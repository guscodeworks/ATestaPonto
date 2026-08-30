"use strict";

const { Router } = require("express");
const {
  createAcesso,
  getMeusAcessos,
  listAcessos,
  getAcesso,
  suspenderAcesso,
  reativarAcesso,
  revogarAcesso,
} = require("../controllers/adminAccessController");
const { sensitiveLimiter } = require("../middlewares/rateLimiters");
const {
  createAcessoValidator,
  acessoIdValidator,
  paginationValidator,
} = require("../middlewares/validators");
const {
  escopoMiddleware,
  escopoPorCapacidade,
  exigirCapacidade,
} = require("../middlewares/adminScope");

const router = Router();

router.get(
  "/",
  escopoPorCapacidade("acesso.listar"),
  paginationValidator,
  listAcessos
);

// /meu ANTES de /:id — caso contrário "meu" é capturado por acessoIdValidator e
// rejeitado como id inválido. Sem validadores extras: é leitura do próprio contexto.
router.get("/meu", exigirCapacidade("acesso.proprio.visualizar"), getMeusAcessos);

router.get("/:id", acessoIdValidator, getAcesso);

// Mutações preservam o escopo agregado existente, pois sua autorização também
// depende da matriz de delegação no service.
router.use(escopoMiddleware);
router.post("/", sensitiveLimiter, createAcessoValidator, createAcesso);

// Ciclo de vida (transição de status): suspender/reativar/revogar. Reusamos
// acessoIdValidator (GET /:id) para validar o param :id. A lógica de quem-pode-
// alterar-o-quê fica no service (reuso da matriz de delegação). sensitiveLimiter
// protege mutações de status contra abuso.
router.patch("/:id/suspender", sensitiveLimiter, acessoIdValidator, suspenderAcesso);
router.patch("/:id/reativar", sensitiveLimiter, acessoIdValidator, reativarAcesso);
router.patch("/:id/revogar", sensitiveLimiter, acessoIdValidator, revogarAcesso);

module.exports = router;
