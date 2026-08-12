"use strict";

const { Router } = require("express");
const {
  createAcesso,
  listAcessos,
  getAcesso,
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
// escopo e concessão sujeita a anti-escalada no service.
router.use(escopoMiddleware);

router.get("/", paginationValidator, listAcessos);
router.get("/:id", acessoIdValidator, getAcesso);
router.post("/", sensitiveLimiter, createAcessoValidator, createAcesso);

module.exports = router;
