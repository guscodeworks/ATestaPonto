"use strict";

const env = require("../config/env");
const punchService = require("../services/punchService");
const { validateQrCode } = require("../services/qrCodeService");
const { registerAuditLog } = require("../services/auditLogService");
const { maskCpf, normalizeCpf } = require("../utils/cpf");
const { ForbiddenError } = require("../utils/errors");

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")?.[0]?.trim() || req.ip || null;
}

function getClientUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 255) || null;
}

function getRequestQrCode(req) {
  return String(req.body.qrCode || req.body.qr_code || req.body.qrToken || "").trim();
}

function getSessionQrCode(req) {
  return String(req.session?.punchAccess?.qrCode || "").trim();
}

function getSessionUnitCode(_req) {
  return env.SCHOOL_UNIT_CODE;
}

function getAuditLogin(req) {
  const rawLogin = String(req.body.login || req.body.email || req.body.cpf || "").trim();
  if (rawLogin.includes("@")) {
    return rawLogin.toLowerCase();
  }

  const cpf = normalizeCpf(rawLogin || req.body.cpf);
  return cpf ? maskCpf(cpf) : null;
}

async function ensureValidDailyQrCode(
  req,
  { evento, ipOrigem, funcionarioId = null, login = null } = {}
) {
  const bodyQrCode = getRequestQrCode(req);
  const sessionQrCode = getSessionQrCode(req);
  const qrCode = bodyQrCode || sessionQrCode;

  if (sessionQrCode && bodyQrCode && sessionQrCode !== bodyQrCode) {
    await registerAuditLog({
      evento,
      nivel: "WARN",
      funcionarioId,
      mensagem: "Tentativa com QR Code diferente do QR validado na sessao",
      ipOrigem,
      metadados: {
        login,
        token_hint: bodyQrCode.slice(0, 12),
        session_token_hint: sessionQrCode.slice(0, 12),
      },
    });

    throw new ForbiddenError("QR Code invalido ou expirado. Solicite um novo acesso.");
  }

  const validation = await validateQrCode(qrCode, {
    unidadeCodigo: getSessionUnitCode(req),
  });

  if (validation.valid) {
    return validation;
  }

  await registerAuditLog({
    evento,
    nivel: "WARN",
    funcionarioId,
    mensagem: "Tentativa com QR Code invalido ou expirado",
    ipOrigem,
    metadados: {
      login,
      status_qr: validation.status,
      token_hint: qrCode ? qrCode.slice(0, 12) : null,
    },
  });

  throw new ForbiddenError("QR Code invalido ou expirado. Solicite um novo acesso.");
}

async function loginFuncionario(req, res, next) {
  const ipOrigem = getClientIp(req);

  try {
    await ensureValidDailyQrCode(req, {
      evento: "funcionario_login_qr_invalido",
      ipOrigem,
      login: getAuditLogin(req),
    });

    const result = await punchService.loginFuncionario(req.body, {
      ipOrigem,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function registerPunch(req, res, next) {
  const ipOrigem = getClientIp(req);

  try {
    await ensureValidDailyQrCode(req, {
      evento: "batida_ponto_qr_invalido",
      ipOrigem,
      funcionarioId: req.auth?.id || null,
    });

    const result = await punchService.registerPunch(
      {
        funcionarioId: req.auth.id,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
      },
      {
        ipOrigem,
        userAgent: getClientUserAgent(req),
      }
    );

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  loginFuncionario,
  registerPunch,
};
