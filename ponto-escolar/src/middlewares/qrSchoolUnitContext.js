"use strict";

const {
  resolveSchoolUnitByQrToken,
} = require("../services/schoolUnitQrService");
const { ForbiddenError } = require("../utils/errors");

const QR_CONTEXT_SESSION_KEY = "funcionario_qr";

function clearQrSchoolUnitContext(req) {
  if (req.session) {
    delete req.session[QR_CONTEXT_SESSION_KEY];
  }
}

function getQrTokenFromSession(req) {
  const storedContext = req.session?.[QR_CONTEXT_SESSION_KEY];
  return typeof storedContext?.token === "string" ? storedContext.token : "";
}

async function resolveQrSchoolUnitContext(req) {
  const token = getQrTokenFromSession(req);
  if (!token) {
    return null;
  }

  const qrContext = await resolveSchoolUnitByQrToken(token);
  if (!qrContext) {
    clearQrSchoolUnitContext(req);
    throw new ForbiddenError("QR Code invalido ou revogado");
  }

  return qrContext;
}

// A URL é a única entrada do token. A unidade nunca vem da requisição do
// cliente: ela é resolvida pelo índice reverso no Redis antes de abrir o login.
async function establishQrSchoolUnitContext(req, _res, next) {
  try {
    if (!Object.prototype.hasOwnProperty.call(req.query, "qr")) {
      clearQrSchoolUnitContext(req);
      return next();
    }

    const token = typeof req.query.qr === "string" ? req.query.qr.trim() : "";
    clearQrSchoolUnitContext(req);

    const qrContext = await resolveSchoolUnitByQrToken(token);
    if (!qrContext) {
      throw new ForbiddenError("QR Code invalido ou revogado");
    }

    req.session[QR_CONTEXT_SESSION_KEY] = { token };
    req.qrSchoolUnit = qrContext;
    return next();
  } catch (error) {
    return next(error);
  }
}

// Revalida antes da autenticação. Assim, um token regenerado depois de a
// página ter sido aberta não pode mais ser aproveitado para iniciar sessão.
async function requireCurrentQrSchoolUnitContext(req, _res, next) {
  try {
    const qrContext = await resolveQrSchoolUnitContext(req);
    if (qrContext) {
      req.qrSchoolUnit = qrContext;
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  establishQrSchoolUnitContext,
  requireCurrentQrSchoolUnitContext,
};
