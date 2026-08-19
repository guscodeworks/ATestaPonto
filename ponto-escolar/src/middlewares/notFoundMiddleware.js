"use strict";

const path = require("path");
const { NotFoundError } = require("../utils/errors");

function acceptsHtml(req) {
  const accept = req.get("accept") || "";
  return accept.includes("text/html");
}

function notFoundMiddleware({ viewsRoot, noCacheHtmlHeaders }) {
  return function handleNotFound(req, res, next) {
    // Apenas navegações de páginas devem receber a tela HTML. Requisições de
    // API e outros métodos continuam usando o formato JSON padronizado.
    const isPageRequest =
      (req.method === "GET" || req.method === "HEAD") &&
      !req.path.startsWith("/api/") &&
      !req.path.startsWith("/ponto/") &&
      acceptsHtml(req);

    if (isPageRequest) {
      res.set(noCacheHtmlHeaders);
      return res.status(404).sendFile(path.join(viewsRoot, "error/error.html"));
    }

  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
  };
}

module.exports = {
  notFoundMiddleware,
};
