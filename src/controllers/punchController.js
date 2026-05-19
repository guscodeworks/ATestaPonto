const env = require('../config/env');
const { withTransaction } = require('../config/database');
const { isValidTokenFormat } = require('../utils/token');
const { isWithinRadius } = require('../utils/location');
const { maskCpf } = require('../utils/cpf');
const { isDailyQrTokenValid, getSaoPauloDateKey } = require('../services/dailyQrTokenService');
const {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError
} = require('../utils/errors');
const { registerAuditLog } = require('../services/auditLogService');

const PUNCH_TYPES = ['ENTRADA', 'SAIDA_ALMOCO', 'VOLTA_ALMOCO', 'SAIDA'];

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || null;
}

function getSaoPauloDateTime(referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(referenceDate);
  const map = {};
  parts.forEach((part) => {
    map[part.type] = part.value;
  });

  return {
    date: `${map.year}-${map.month}-${map.day}`,
    dateTime: `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`
  };
}

async function registerPunch(req, res, next) {
  try {
    const cpf = String(req.body.cpf || '').trim();
    const qrToken = String(req.body.qrToken || '').trim();
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const ipOrigem = getClientIp(req);

    if (!isValidTokenFormat(qrToken)) {
      await registerAuditLog({
        evento: 'tentativa_qr_invalido',
        nivel: 'WARN',
        mensagem: 'Tentativa de batida com token malformado',
        ipOrigem,
        metadados: { cpf: maskCpf(cpf) }
      });
      throw new BadRequestError('QR token malformado');
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestError('Localizacao invalida para registro de ponto');
    }

    const distanceCheck = isWithinRadius(
      { latitude: env.SCHOOL_LATITUDE, longitude: env.SCHOOL_LONGITUDE },
      { latitude, longitude },
      env.ALLOWED_RADIUS_METERS
    );

    if (!distanceCheck.distanceMeters && distanceCheck.distanceMeters !== 0) {
      throw new BadRequestError('Localizacao invalida para registro de ponto');
    }

    const now = new Date();
    const { date, dateTime } = getSaoPauloDateTime(now);
    const tokenDate = getSaoPauloDateKey(now);

    const punch = await withTransaction(async (tx) => {
      const funcionario = await tx.executeOne(
        `SELECT id, cpf, nome, ativo
         FROM funcionarios
         WHERE cpf = ?
         LIMIT 1
         FOR UPDATE`,
        [cpf]
      );

      if (!funcionario) {
        await registerAuditLog({
          evento: 'tentativa_cpf_inexistente',
          nivel: 'WARN',
          mensagem: 'Tentativa de batida com CPF inexistente',
          ipOrigem,
          metadados: { cpf: maskCpf(cpf) }
        });
        throw new NotFoundError('Funcionario nao encontrado');
      }

      if (!funcionario.ativo) {
        throw new ForbiddenError('Funcionario inativo');
      }

      const qrTokenValido = isDailyQrTokenValid(qrToken, now);
      if (!qrTokenValido) {
        await registerAuditLog({
          evento: 'tentativa_qr_invalido',
          nivel: 'WARN',
          funcionarioId: funcionario.id,
          mensagem: 'Tentativa de batida com QR token invalido',
          ipOrigem,
          metadados: { status: 'invalido', data_referencia: tokenDate }
        });
        throw new UnauthorizedError('QR token invalido');
      }

      if (!distanceCheck.isWithin) {
        await registerAuditLog({
          evento: 'tentativa_fora_localizacao',
          nivel: 'WARN',
          funcionarioId: funcionario.id,
          mensagem: 'Tentativa de batida fora da localizacao permitida',
          ipOrigem,
          metadados: { distancia_metros: distanceCheck.distanceMeters }
        });
        throw new ForbiddenError('Voce so pode bater ponto dentro da area permitida da escola.');
      }

      const countRow = await tx.executeOne(
        `SELECT COUNT(*) AS total
         FROM registro_de_pontos
         WHERE funcionario_id = ? AND data_referencia = ?
         FOR UPDATE`,
        [funcionario.id, date]
      );

      const totalPontos = Number(countRow?.total || 0);
      if (totalPontos >= 4) {
        throw new ConflictError('Funcionario ja realizou 4 batidas hoje');
      }

      const sequencia = totalPontos + 1;
      const tipo = PUNCH_TYPES[sequencia - 1];

      const insertResult = await tx.execute(
        `INSERT INTO registro_de_pontos
         (funcionario_id, data_referencia, sequencia, tipo, registrado_em, latitude, longitude, distancia_metros, ip_origem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          funcionario.id,
          date,
          sequencia,
          tipo,
          dateTime,
          latitude,
          longitude,
          distanceCheck.distanceMeters,
          ipOrigem
        ]
      );

      return {
        id: insertResult.insertId,
        funcionario,
        sequencia,
        tipo,
        registradoEm: dateTime
      };
    });

    await registerAuditLog({
      evento: 'batida_ponto_realizada',
      funcionarioId: punch.funcionario.id,
      mensagem: 'Batida de ponto registrada com sucesso',
      ipOrigem,
      metadados: { sequencia: punch.sequencia, tipo: punch.tipo }
    });

    return res.status(201).json({
      success: true,
      data: {
        ponto: {
          id: punch.id,
          sequencia: punch.sequencia,
          tipo: punch.tipo,
          registrado_em: punch.registradoEm
        },
        funcionario: {
          id: punch.funcionario.id,
          nome: punch.funcionario.nome,
          cpf: maskCpf(punch.funcionario.cpf)
        }
      }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return next(new ConflictError('Registro duplicado de ponto detectado'));
    }
    return next(error);
  }
}

module.exports = {
  registerPunch
};
