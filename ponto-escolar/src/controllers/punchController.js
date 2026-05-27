const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { executeOne, withTransaction } = require('../config/database');
const { isWithinRadius } = require('../utils/location');
const { maskCpf, normalizeCpf } = require('../utils/cpf');
const {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError
} = require('../utils/errors');
const { registerAuditLog } = require('../services/auditLogService');
const { validateQrCode } = require('../services/qrCodeService');

const PUNCH_TYPES = ['ENTRADA', 'SAIDA_ALMOCO', 'VOLTA_ALMOCO', 'SAIDA'];
const EMPTY_PUNCH_TIME = '00:00:00';

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || null;
}

function getClientUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 255) || null;
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
    time: `${map.hour}:${map.minute}:${map.second}`,
    dateTime: `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`
  };
}

function normalizeTimeValue(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return EMPTY_PUNCH_TIME;
  }

  const candidate = raw.slice(0, 8);
  if (/^\d{2}:\d{2}:\d{2}$/.test(candidate)) {
    return candidate;
  }

  return EMPTY_PUNCH_TIME;
}

function hasPunchTime(value) {
  return normalizeTimeValue(value) !== EMPTY_PUNCH_TIME;
}

function findLunchColumnKey(row, prefix) {
  return (
    Object.keys(row || {}).find((key) =>
      String(key || '')
        .toLowerCase()
        .startsWith(prefix)
    ) || null
  );
}

function readPunchTimesFromRow(row) {
  const saidaAlmocoKey = findLunchColumnKey(row, 'saida_almo');
  const voltaAlmocoKey = findLunchColumnKey(row, 'volta_almo');

  return {
    entrada: normalizeTimeValue(row?.entrada),
    saidaAlmoco: normalizeTimeValue(saidaAlmocoKey ? row[saidaAlmocoKey] : null),
    voltaAlmoco: normalizeTimeValue(voltaAlmocoKey ? row[voltaAlmocoKey] : null),
    saida: normalizeTimeValue(row?.saida)
  };
}

function resolveNextPunch(times) {
  if (!hasPunchTime(times.entrada)) {
    return { sequence: 1, type: PUNCH_TYPES[0], field: 'entrada' };
  }
  if (!hasPunchTime(times.saidaAlmoco)) {
    return { sequence: 2, type: PUNCH_TYPES[1], field: 'saidaAlmoco' };
  }
  if (!hasPunchTime(times.voltaAlmoco)) {
    return { sequence: 3, type: PUNCH_TYPES[2], field: 'voltaAlmoco' };
  }
  if (!hasPunchTime(times.saida)) {
    return { sequence: 4, type: PUNCH_TYPES[3], field: 'saida' };
  }
  return null;
}

function validateLocation(latitude, longitude) {
  const distanceCheck = isWithinRadius(
    { latitude: env.SCHOOL_LATITUDE, longitude: env.SCHOOL_LONGITUDE },
    { latitude, longitude },
    env.ALLOWED_RADIUS_METERS
  );

  if (!distanceCheck.distanceMeters && distanceCheck.distanceMeters !== 0) {
    throw new BadRequestError('Localizacao invalida para registro de ponto');
  }

  if (!distanceCheck.isWithin) {
    throw new ForbiddenError('Voce so pode bater ponto dentro da area permitida da escola.');
  }

  return distanceCheck;
}

function mapFuncionario(funcionario) {
  return {
    id: funcionario.id,
    nome: funcionario.nome,
    email: funcionario.email,
    cpf: maskCpf(funcionario.cpf)
  };
}

function getRequestQrCode(req) {
  return String(req.body.qrCode || req.body.qr_code || req.body.qrToken || '').trim();
}

async function ensureValidDailyQrCode(req, { evento, ipOrigem, funcionarioId = null, login = null } = {}) {
  const qrCode = getRequestQrCode(req);
  const validation = await validateQrCode(qrCode, { unidadeCodigo: env.SCHOOL_UNIT_CODE });

  if (validation.valid) {
    return;
  }

  await registerAuditLog({
    evento,
    nivel: 'WARN',
    funcionarioId,
    mensagem: 'Tentativa com QR Code invalido ou expirado',
    ipOrigem,
    metadados: {
      login,
      status_qr: validation.status,
      token_hint: qrCode ? qrCode.slice(0, 12) : null
    }
  });

  throw new ForbiddenError('QR Code invalido ou expirado. Solicite um novo acesso.');
}

async function loginFuncionario(req, res, next) {
  try {
    const rawLogin = String(req.body.login || req.body.email || req.body.cpf || '').trim();
    const cpf = normalizeCpf(rawLogin || req.body.cpf);
    const email = rawLogin.includes('@') ? rawLogin.toLowerCase() : '';
    const senha = String(req.body.senha || '');
    const ipOrigem = getClientIp(req);

    if (!rawLogin) {
      throw new BadRequestError('Informe CPF ou email');
    }

    await ensureValidDailyQrCode(req, {
      evento: 'funcionario_login_qr_invalido',
      ipOrigem,
      login: email || maskCpf(cpf)
    });

    const funcionario = await executeOne(
      `SELECT id, cpf, nome, email, senha, ativo
       FROM funcionarios
       WHERE ${email ? 'email = ?' : 'cpf = ?'}
       LIMIT 1`,
      [email || cpf]
    );

    const senhaCorreta = funcionario ? await bcrypt.compare(senha, String(funcionario.senha || '')) : false;
    if (!funcionario || !senhaCorreta) {
      await registerAuditLog({
        evento: 'funcionario_login_invalido',
        nivel: 'WARN',
        mensagem: 'Tentativa de login de funcionario invalida',
        ipOrigem,
        metadados: { login: email || maskCpf(cpf) }
      });
      throw new UnauthorizedError('CPF/email ou senha invalidos');
    }

    if (!funcionario.ativo) {
      throw new ForbiddenError('Funcionario inativo');
    }

    const tokenPayload = {
      sub: String(funcionario.id),
      role: 'funcionario'
    };
    const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: env.FUNCIONARIO_JWT_EXPIRES_IN });

    await registerAuditLog({
      evento: 'funcionario_login_sucesso',
      funcionarioId: funcionario.id,
      mensagem: 'Login de funcionario realizado com CPF/email e senha',
      ipOrigem,
      metadados: { login: email || maskCpf(cpf) }
    });

    return res.status(200).json({
      success: true,
      data: {
        token,
        expiresIn: env.FUNCIONARIO_JWT_EXPIRES_IN,
        funcionario: mapFuncionario(funcionario)
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function registerPunch(req, res, next) {
  try {
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const ipOrigem = getClientIp(req);
    const userAgent = getClientUserAgent(req);

    await ensureValidDailyQrCode(req, {
      evento: 'batida_ponto_qr_invalido',
      ipOrigem,
      funcionarioId: req.auth?.id || null
    });

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestError('Localizacao invalida para registro de ponto');
    }

    const distanceCheck = validateLocation(latitude, longitude);
    const { date, time, dateTime } = getSaoPauloDateTime(new Date());

    const punch = await withTransaction(async (tx) => {
      const funcionario = await tx.executeOne(
        `SELECT id, cpf, nome, email, ativo
         FROM funcionarios
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [req.auth.id]
      );

      if (!funcionario) {
        throw new NotFoundError('Funcionario nao encontrado');
      }

      if (!funcionario.ativo) {
        throw new ForbiddenError('Funcionario inativo');
      }

      const existingRow = await tx.executeOne(
        `SELECT *
         FROM registro_de_pontos
         WHERE funcionario_id = ? AND data_referenciada = ?
         LIMIT 1
         FOR UPDATE`,
        [funcionario.id, date]
      );

      let rowId = null;
      let sequence = 1;
      let type = PUNCH_TYPES[0];

      if (!existingRow) {
        const insertResult = await tx.execute(
          'INSERT INTO registro_de_pontos VALUES (NULL, ?, ?, ?, ?, ?, ?)',
          [funcionario.id, date, time, EMPTY_PUNCH_TIME, EMPTY_PUNCH_TIME, EMPTY_PUNCH_TIME]
        );
        rowId = Number(insertResult.insertId);
      } else {
        const times = readPunchTimesFromRow(existingRow);
        const nextPunch = resolveNextPunch(times);

        if (!nextPunch) {
          throw new ConflictError('Funcionario ja realizou 4 batidas hoje');
        }

        sequence = nextPunch.sequence;
        type = nextPunch.type;
        times[nextPunch.field] = time;

        await tx.execute('DELETE FROM registro_de_pontos WHERE id = ?', [existingRow.id]);
        await tx.execute(
          'INSERT INTO registro_de_pontos VALUES (?, ?, ?, ?, ?, ?, ?)',
          [existingRow.id, funcionario.id, date, times.entrada, times.saidaAlmoco, times.voltaAlmoco, times.saida]
        );
        rowId = Number(existingRow.id);
      }

      return {
        id: rowId,
        funcionario,
        sequence,
        type,
        registeredAt: dateTime,
        distanceMeters: distanceCheck.distanceMeters
      };
    });

    await registerAuditLog({
      evento: 'batida_ponto_realizada',
      funcionarioId: punch.funcionario.id,
      mensagem: 'Batida de ponto registrada com sucesso',
      ipOrigem,
      metadados: {
        sequencia: punch.sequence,
        tipo: punch.type,
        distancia_metros: punch.distanceMeters,
        latitude,
        longitude,
        user_agent: userAgent
      }
    });

    return res.status(201).json({
      success: true,
      data: {
        ponto: {
          id: punch.id,
          sequencia: punch.sequence,
          tipo: punch.type,
          registrado_em: punch.registeredAt,
          distancia_metros: punch.distanceMeters
        },
        funcionario: mapFuncionario(punch.funcionario)
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
  loginFuncionario,
  registerPunch
};
