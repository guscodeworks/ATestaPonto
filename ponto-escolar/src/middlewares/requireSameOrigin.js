"use strict";

const { ForbiddenError } = require("../utils/errors");

// Protege mutações por formulário com cookie de sessão, inclusive quando CORS
// não recebe Origin (por exemplo, navegadores que enviam apenas Referer).
function requireSameOrigin(req, _res, next) {
  const source = req.get("origin") || req.get("referer");
  try {
    const expected = new URL(`${req.protocol}://${req.get("host")}`).origin;
    if (source && new URL(source).origin === expected) {
      return next();
    }
  } catch (_error) {
    // Cabeçalho ausente ou malformado: falha fechada.
  }
  return next(new ForbiddenError("Origem da requisicao nao permitida"));
}

module.exports = requireSameOrigin;
