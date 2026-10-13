"use strict";

const {
  findCurrentSchoolUnitQr,
  generateSchoolUnitQr,
} = require("../services/schoolUnitQrService");
const { registerAuditLog } = require("../services/auditLogService");
const { getClientIp } = require("../utils/request");

function getBaseUrl(req) {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.get("host");
  return host ? `${protocol}://${host}` : "";
}

async function getCurrentQr(req, res, next) {
  try {
    const qrCode = await findCurrentSchoolUnitQr(req.unidadeEscolarId, {
      baseUrl: getBaseUrl(req),
    });

    return res.status(200).json({
      success: true,
      data: { qrCode },
    });
  } catch (error) {
    return next(error);
  }
}

async function generateQr(req, res, next) {
  try {
    const qrCode = await generateSchoolUnitQr({
      unidadeEscolarId: req.unidadeEscolarId,
      baseUrl: getBaseUrl(req),
    });

    await registerAuditLog({
      evento: "qr_code_escolar_gerado",
      adminId: req.auth.id,
      mensagem: "Administrador gerou ou regenerou QR Code escolar",
      ipOrigem: getClientIp(req),
      metadados: {
        unidade_escolar_id: req.unidadeEscolarId,
        acesso_autorizador_id: req.acessoAutorizador.id,
      },
    });

    return res.status(200).json({
      success: true,
      data: { qrCode },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCurrentQr,
  generateQr,
};
