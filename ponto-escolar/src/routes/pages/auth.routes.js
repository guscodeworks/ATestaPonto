"use strict";

const { Router } = require("express");

function createAuthPagesRouter({ sendView }) {
  const router = Router();

  router.get("/", (_req, res) => sendView(res, "index.html"));
  router.get("/home", (_req, res) => res.redirect("/"));
  router.get("/login", (_req, res) => sendView(res, "index.html"));
  router.get("/recuperar-senha", (_req, res) => sendView(res, "password/password.html"));
  router.get("/views/password/password.html", (_req, res) => sendView(res, "password/password.html"));
  router.get("/first-access", (_req, res) => sendView(res, "auth/first-access.html"));

  return router;
}

module.exports = { createAuthPagesRouter };
