"use strict";

const { Router } = require("express");

// Rotas "limpas" (sem sufixo .html) que também podem ser acessadas com extensão
// .html — usado para redirecionar links antigos que apontavam para o arquivo estático
// diretamente (ex: /admin/dashboard.html) para a rota atual sem extensão.
const CLEAN_ROUTES_COMPATIBLE_WITH_HTML_SUFFIX = new Set([
  "/login",
  "/admin/login",
  "/admin/dashboard",
  "/admin/funcionario",
  "/admin/funcionarios",
  "/admin/funcionarios/novo",
  "/admin/pontos",
  "/admin/pontos-do-dia",
  "/admin/relatorios",
  "/admin/configuracao",
  "/admin/configuracoes",
  "/funcionario",
  "/funcionario/perfil",
  "/funcionario/relatorio",
]);

// Mapeamento explícito de URLs antigas (renomeadas ou removidas) para as rotas
// atuais equivalentes, preservando links/favoritos salvos por usuários.
const LEGACY_REDIRECT_MAP = Object.freeze({
  "/index.html": "/",
  "/home.html": "/",
  "/login.html": "/login",
  "/admin/index": "/admin/dashboard",
  "/admin/index.html": "/admin/dashboard",
  "/admin/login_adm": "/admin/login",
  "/admin/login_adm.html": "/admin/login",
  "/admin/registrar-funcionario": "/admin/funcionarios/novo",
  "/admin/registrar-funcionario.html": "/admin/funcionarios/novo",
  "/funcionario/ponto.html": "/funcionario",
  "/funcionario/login": "/login",
  "/funcionario/login.html": "/login",
});

// Remove a barra final (exceto na raiz) para que "/admin/login/" e "/admin/login"
// sejam tratados como o mesmo caminho na resolução de redirecionamento.
function normalizePath(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function resolveLegacyTarget(pathname) {
  const normalized = normalizePath(pathname);
  const mapped = LEGACY_REDIRECT_MAP[normalized];
  if (mapped) {
    return mapped;
  }

  // Fallback genérico: qualquer rota limpa conhecida também é aceita com sufixo
  // .html, sem precisar de uma entrada individual no mapa acima.
  if (normalized.endsWith(".html")) {
    const withoutExtension = normalized.slice(0, -5);
    if (CLEAN_ROUTES_COMPATIBLE_WITH_HTML_SUFFIX.has(withoutExtension)) {
      return withoutExtension;
    }
  }

  return {};
}

// Catch-all: intercepta qualquer caminho não tratado pelos routers anteriores,
// tentando resolvê-lo como uma URL legada antes de repassar ao próximo
// middleware (que eventualmente resulta em 404 se não houver correspondência).
function createLegacyPagesRouter() {
  const router = Router();

  router.get("/{*legacyPath}", (req, res, next) => {
    const target = resolveLegacyTarget(req.path);
    if (!target || target === req.path) {
      return next();
    }
    return res.redirect(target);
  });

  return router;
}

module.exports = { createLegacyPagesRouter };