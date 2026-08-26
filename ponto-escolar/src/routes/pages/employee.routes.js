"use strict";

const { Router } = require("express");

function createFuncionarioPagesRouter({ sendView }) {
  const router = Router();

  router.get("/funcionario", (_req, res) =>
    sendView(res, "employee/punch.html")
  );
  router.get("/funcionario/perfil", (_req, res) =>
    sendView(res, "employee/profile.html")
  );
  router.get("/funcionario/relatorio", (_req, res) =>
    sendView(res, "employee/report.html")
  );

  return router;
}

module.exports = { createFuncionarioPagesRouter };
