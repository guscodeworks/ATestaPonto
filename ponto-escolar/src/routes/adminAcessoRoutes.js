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
} = require("../controllers/adminAcessoController");
const { sensitiveLimiter } = require("../middlewares/rateLimiters");
const {
  createAcessoValidator,
  acessoIdValidator,
  paginationValidator,
} = require("../middlewares/validators");
const { escopoMiddleware } = require("../middlewares/adminScope");

const router = Router();

// Escopo aplicado a todos os endpoints de acessos: listagens filtradas pelo
// escopo e concessão/alteração sujeitas a anti-escalada no service.
router.use(escopoMiddleware);

router.get("/", paginationValidator, listAcessos);

// /meu ANTES de /:id — caso contrário "meu" é capturado por acessoIdValidator e
// rejeitado como id inválido. Sem validadores extras: é leitura do próprio contexto.
router.get("/meu", getMeusAcessos);

router.get("/:id", acessoIdValidator, getAcesso);
router.post("/", sensitiveLimiter, createAcessoValidator, createAcesso);

// Ciclo de vida (transição de status): suspender/reativar/revogar. Reusamos
// acessoIdValidator (GET /:id) para validar o param :id. A lógica de quem-pode-
// alterar-o-quê fica no service (reuso da matriz de delegação). sensitiveLimiter
// protege mutações de status contra abuso.
router.patch("/:id/suspender", sensitiveLimiter, acessoIdValidator, suspenderAcesso);
router.patch("/:id/reativar", sensitiveLimiter, acessoIdValidator, reativarAcesso);
router.patch("/:id/revogar", sensitiveLimiter, acessoIdValidator, revogarAcesso);

module.exports = router;
