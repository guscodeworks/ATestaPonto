const env = require("../config/env");
const { AppError, normalizeError } = require("../utils/errors");
const { logger, safeRequestContext, safeErrorContext } = require("../utils/logger");

function buildErrorPayload(error) {
  const statusCode = Number.isInteger(error.statusCode)
    ? error.statusCode
    : 500;
  const payload = {
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "Internal server error",
    },
  };

  if (error.details) {
    payload.error.details = error.details;
  }

  // Stack trace só é exposto fora de produção, evitando vazar detalhes internos
  // da aplicação para o cliente em ambiente real.
  if (!env.IS_PRODUCTION && error.stack) {
    payload.error.stack = error.stack;
  }

  return {
    statusCode,
    payload,
  };
}

function errorMiddleware(error, req, res, next) {
  // Se os headers já foram enviados, não é mais possível responder ao cliente;
  // delega ao handler de erro padrão do Express (comportamento exigido pela própria lib).
  if (res.headersSent) {
    logger.error("Request failed after headers sent", {
      ...safeRequestContext(req),
      error: safeErrorContext(error),
    });
    return next(new Error("Request failed after headers sent"));
  }

  const normalized = normalizeError(error);
  // Erros que não são AppError (operacionais/esperados) são tratados como falha
  // interna genérica, evitando expor mensagens de erros de bibliotecas/infra ao cliente.
  const safeError =
    normalized instanceof AppError
      ? normalized
      : normalizeError(new Error("Unhandled non-operational error"));

  // Em produção, erros 5xx nunca expõem mensagem ou detalhes originais ao cliente,
  // apenas uma mensagem genérica. Logs também omitem detalhes não confiáveis.
  if (env.IS_PRODUCTION && safeError.statusCode >= 500) {
    safeError.message = "Internal server error";
    safeError.details = {};
  }

  logger.error("Request failed", {
    ...safeRequestContext(req),
    statusCode: safeError.statusCode,
    error: safeErrorContext(error),
    normalizedError: safeErrorContext(safeError),
  });

  const { statusCode, payload } = buildErrorPayload(safeError);
  return res.status(statusCode).json(payload);
}

module.exports = {
  errorMiddleware,
};
