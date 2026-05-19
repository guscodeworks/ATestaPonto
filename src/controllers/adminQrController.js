const { isValidTokenFormat } = require('../utils/token');
const { BadRequestError } = require('../utils/errors');
const { getDailyQrTokenPayload, isDailyQrTokenValid } = require('../services/dailyQrTokenService');
const { registerAuditLog } = require('../services/auditLogService');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || null;
}

function mapQrToken(token, includeRawToken = false) {
  return {
    id: token.id,
    token_hint: token.token_hint,
    contexto: token.contexto,
    ativo: Boolean(token.ativo),
    expira_em: token.expira_em,
    max_uso: null,
    uso_atual: null,
    ultimo_uso_em: null,
    criado_em: null,
    desativado_em: null,
    rotacao: token.rotacao,
    timezone: token.timezone,
    data_referencia: token.data_referencia,
    ...(includeRawToken ? { token: token.token } : {})
  };
}

async function generateQrToken(req, res, next) {
  try {
    const token = getDailyQrTokenPayload();

    await registerAuditLog({
      evento: 'qr_token_diario_consultado',
      adminId: req.auth.id,
      mensagem: 'Administrador consultou QR token diario',
      ipOrigem: getClientIp(req),
      metadados: { data_referencia: token.data_referencia, expira_em: token.expira_em }
    });

    return res.status(200).json({
      success: true,
      data: {
        qrToken: mapQrToken(token, true)
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function listQrTokens(req, res, next) {
  try {
    const token = getDailyQrTokenPayload();

    return res.status(200).json({
      success: true,
      data: {
        items: [mapQrToken(token)],
        pagination: {
          page: 1,
          limit: 1,
          total: 1
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function deactivateQrToken(req, res, next) {
  try {
    throw new BadRequestError('Token diario automatico nao pode ser desativado manualmente');
  } catch (error) {
    return next(error);
  }
}

async function validateQrToken(req, res, next) {
  try {
    const qrToken = String(req.body.qrToken || '').trim();
    if (!isValidTokenFormat(qrToken)) {
      throw new BadRequestError('QR token malformado');
    }

    const token = getDailyQrTokenPayload();
    const isValid = isDailyQrTokenValid(qrToken);
    const status = isValid ? 'valido' : 'invalido';

    if (!isValid) {
      await registerAuditLog({
        evento: 'tentativa_qr_invalido',
        nivel: 'WARN',
        adminId: req.auth.id,
        mensagem: 'Tentativa de validacao de QR token invalido',
        ipOrigem: getClientIp(req),
        metadados: { status, data_referencia: token.data_referencia }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        valido: isValid,
        status,
        qrToken: mapQrToken(token)
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  generateQrToken,
  listQrTokens,
  deactivateQrToken,
  validateQrToken
};
