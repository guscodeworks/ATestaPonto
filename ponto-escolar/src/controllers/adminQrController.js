const { NotFoundError } = require("../utils/errors");
const {
  createQrCode,
  deactivateQrCode,
  listQrCodes,
  validateQrCode,
} = require("../services/qrCodeService");
const { registerAuditLog } = require("../services/auditLogService");
const { getClientIp } = require("../utils/request");

function getBaseUrl(req) {
  // O QR precisa refletir o host acessado quando a aplicacao roda atras de proxy.
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.get("host");
  return host ? `${protocol}://${host}` : "";
}

// Atalho de ponto: o QR NÃO vira credencial/token de autorização.
async function generateQrShortcut(req, res, next) {
  try {
    const qrCode = await createQrCode({
      adminId: req.auth.id,
      unidadeCodigo: req.body.unidade_codigo,
      baseUrl: getBaseUrl(req),
    });

    // Geração auditada: o QR é porta de entrada p/ a tela de ponto.
    await registerAuditLog({
      evento: "qr_code_gerado",
      adminId: req.auth.id,
      mensagem: "Administrador gerou QR Code como atalho para a tela de ponto",
      ipOrigem: getClientIp(req),
      metadados: {
        qr_code_id: qrCode.id,
        unidade_codigo: qrCode.unidade_codigo,
        expira_em: qrCode.expira_em,
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        qrCode,
        qrLink: qrCode,
        // Alias legado: é link de acesso, não token de autorização.
        qrToken: qrCode,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function listQrShortcuts(req, res, next) {
  try {
    const result = await listQrCodes({
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function deactivateQrShortcut(req, res, next) {
  try {
    const qrCodeId = Number(req.params.id);
    const deactivated = await deactivateQrCode(qrCodeId);

    if (!deactivated) {
      throw new NotFoundError("QR Code nao encontrado ou ja desativado");
    }

    await registerAuditLog({
      evento: "qr_code_desativado",
      adminId: req.auth.id,
      mensagem: "Administrador desativou atalho de QR Code de ponto",
      ipOrigem: getClientIp(req),
      metadados: { qr_code_id: qrCodeId },
    });

    return res.status(200).json({
      success: true,
      data: {
        id: qrCodeId,
        ativo: false,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function validateQrShortcut(req, res, next) {
  try {
    // Aceita múltiplos nomes de campo (qrCode/qr_code/qrToken) p/ clientes atuais e legados.
    const qrCodeValue = String(
      req.body.qrCode || req.body.qr_code || req.body.qrToken || ""
    ).trim();
    const validation = await validateQrCode(qrCodeValue, {
      unidadeCodigo: req.body.unidade_codigo,
    });

    // Inválidas auditadas em WARN p/ detectar QR forjado/expirado.
    if (!validation.valid) {
      await registerAuditLog({
        evento: "tentativa_link_ponto_invalido",
        nivel: "WARN",
        adminId: req.auth.id,
        mensagem: "Tentativa de conferir link de ponto invalido",
        ipOrigem: getClientIp(req),
        metadados: { status: validation.status },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        valido: validation.valid,
        status: validation.status,
        qrCode: validation.qrCode,
        qrLink: validation.qrCode,
        // Alias legado p/ clientes antigos que ainda leem qrToken.
        qrToken: validation.qrCode,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  generateQrShortcut,
  listQrShortcuts,
  deactivateQrShortcut,
  validateQrShortcut,
};