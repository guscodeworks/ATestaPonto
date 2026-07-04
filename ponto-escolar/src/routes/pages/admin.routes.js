"use strict";

const { Router } = require("express");
const requireAdmin = require("../../middlewares/ensureAdminAuthenticated");

function renderAdminView(sendView, viewPath) {
  return (_req, res) => sendView(res, viewPath);
}

function redirectTo(path) {
  return (_req, res) => res.redirect(path);
}

function createAdminPagesRouter({ sendView }) {
  const router = Router();
  const dashboardPage = renderAdminView(sendView, "admin/dashboard.html");
  const funcionariosPage = renderAdminView(sendView, "admin/funcionarios.html");
  const registrarFuncionarioPage = renderAdminView(
    sendView,
    "admin/registrar-funcionario.html"
  );
  const pontosPage = renderAdminView(sendView, "admin/pontos-do-dia.html");
  const relatoriosPage = renderAdminView(sendView, "admin/relatorios.html");
  const configuracoesPage = renderAdminView(
    sendView,
    "admin/configuracoes.html"
  );

  // Login/logout de admin não têm view própria: o fluxo real é delegado ao
  // OAuth do Gov.br (rotas /auth/govbr/*).
  router.get("/admin/login", redirectTo("/auth/govbr/login"));
  router.get("/admin/logout", redirectTo("/auth/govbr/logout"));

  router.get("/admin", requireAdmin, redirectTo("/admin/dashboard"));
  router.get("/admin/index", requireAdmin, redirectTo("/admin/dashboard"));
  router.get("/admin/dashboard", requireAdmin, dashboardPage);

  // Rotas alternativas/legadas mantidas por compatibilidade, apontando para a mesma view.
  router.get("/admin/funcionario", requireAdmin, funcionariosPage);
  router.get("/admin/funcionarios", requireAdmin, funcionariosPage);
  router.get(
    "/admin/funcionarios/novo",
    requireAdmin,
    registrarFuncionarioPage
  );
  // Rota antiga de cadastro de funcionário, redirecionada para a URL atual.
  router.get(
    "/admin/registrar-funcionario",
    requireAdmin,
    redirectTo("/admin/funcionarios/novo")
  );

  router.get("/admin/pontos", requireAdmin, pontosPage);
  router.get("/admin/pontos-do-dia", requireAdmin, pontosPage);
  router.get("/admin/relatorios", requireAdmin, relatoriosPage);

  router.get("/admin/configuracoes", requireAdmin, configuracoesPage);

  return router;
}

module.exports = { createAdminPagesRouter };