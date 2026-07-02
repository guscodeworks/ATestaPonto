"use strict";

const { Router } = require("express");
const { createAuthPagesRouter } = require("./auth.routes");
const { createAdminPagesRouter } = require("./admin.routes");
const { createFuncionarioPagesRouter } = require("./funcionario.routes");
const { createLegacyPagesRouter } = require("./legacy.routes");

function createPagesRouter({ sendView }) {
  const router = Router();

  router.use(createAuthPagesRouter({ sendView }));
  router.use(createFuncionarioPagesRouter({ sendView }));
  router.use(createAdminPagesRouter({ sendView }));

  // Atalhos amigáveis (ex: link de QR Code) que apontam para a mesma tela de
  // acesso ao ponto, mantendo uma única URL canônica: /ponto/acessar.
  router.get("/ponto", (_req, res) => {
    res.redirect("/ponto/acessar");
  });

  router.get("/bater-ponto", (_req, res) => {
    res.redirect("/ponto/acessar");
  });

  router.get("/ponto/acessar", (_req, res) => {
    sendView(res, "index.html");
  });

  // Rotas legadas registradas por último para não conflitar com as rotas atuais acima.
  router.use(createLegacyPagesRouter());

  return router;
}

module.exports = { createPagesRouter };