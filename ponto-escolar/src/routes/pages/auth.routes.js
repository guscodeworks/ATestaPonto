"use strict";

const { Router } = require("express");

function createAuthPagesRouter({ sendView }) {
  const router = Router();

  router.get("/", (_req, res) => sendView(res, "index.html"));
  router.get("/home", (_req, res) => res.redirect("/"));
  router.get("/login", (_req, res) => sendView(res, "index.html"));
  router.get("/senha", (_req, res) => sendView(res, "senha/senha.html"));

  return router;
}

module.exports = { createAuthPagesRouter };
