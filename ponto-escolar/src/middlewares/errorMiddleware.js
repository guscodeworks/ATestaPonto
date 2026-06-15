const env = require("../config/env");
const { AppError, normalizeError } = require("../utils/errors");
const { logger } = require("../utils/logger");

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

  if (!env.IS_PRODUCTION && error.stack) {
    payload.error.stack = error.stack;
  }

  return {
    statusCode,
    payload,
  };
}

function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  logger.error("Raw request error", {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userId: req.auth?.id || null,
    error: {
      name: error?.name || null,
      code: error?.code || null,
      status: error?.status || null,
      statusCode: error?.statusCode || null,
      message: error?.message || null,
      stack: error?.stack || null,
      cause: error?.cause || null,
    },
  });

  const normalized = normalizeError(error);
  const safeError =
    normalized instanceof AppError
      ? normalized
      : normalizeError(new Error("Unhandled non-operational error"));

  if (env.IS_PRODUCTION && safeError.statusCode >= 500) {
    safeError.message = "Internal server error";
    safeError.details = null;
  }

  logger.error("Request failed", {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userId: req.auth?.id || null,
    error: {
      name: safeError.name,
      code: safeError.code,
      statusCode: safeError.statusCode,
      message: safeError.message,
    },
  });

  const { statusCode, payload } = buildErrorPayload(safeError);
  return res.status(statusCode).json(payload);
}

module.exports = {
  errorMiddleware,
};
