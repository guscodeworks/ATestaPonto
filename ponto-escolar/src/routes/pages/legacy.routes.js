"use strict";

const { Router } = require("express");

const CLEAN_ROUTES_COMPATIBLE_WITH_HTML_SUFFIX = new Set([
  "/login",
  "/admin/login",
  "/admin/dashboard",
  "/admin/funcionarios",
  "/admin/funcionarios/novo",
  "/admin/pontos-do-dia",
  "/admin/relatorios",
  "/admin/configuracoes",
  "/funcionario",
  "/funcionario/perfil",
  "/funcionario/relatorio",
]);

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

  if (normalized.endsWith(".html")) {
    const withoutExtension = normalized.slice(0, -5);
    if (CLEAN_ROUTES_COMPATIBLE_WITH_HTML_SUFFIX.has(withoutExtension)) {
      return withoutExtension;
    }
  }

  return null;
}

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
