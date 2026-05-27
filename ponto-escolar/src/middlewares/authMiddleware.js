const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { executeOne } = require('../config/database');
const { ForbiddenError, UnauthorizedError } = require('../utils/errors');
const { getAdminAuthCookie } = require('../utils/authCookie');

function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string') {
    return getAdminAuthCookie(req);
  }

  const [scheme, token] = authHeader.split(' ');
  if (!/^Bearer$/i.test(scheme) || !token) {
    return getAdminAuthCookie(req);
  }

  return token.trim();
}

async function authenticateAdmin(req, _res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      throw new UnauthorizedError('Access token is required');
    }

    const payload = jwt.verify(token, env.JWT_SECRET);
    const role = String(payload.role || '').toLowerCase();

    if (role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }

    const adminId = Number(payload.sub || payload.id || 0);
    if (!Number.isInteger(adminId) || adminId <= 0) {
      throw new UnauthorizedError('Invalid access token');
    }

    const admin = await executeOne(
      'SELECT id, nome, email, ativo FROM admins WHERE id = ? LIMIT 1',
      [adminId]
    );

    if (!admin || !admin.ativo) {
      throw new UnauthorizedError('Admin account is inactive');
    }

    req.auth = {
      id: admin.id,
      nome: admin.nome,
      role: 'admin',
      email: admin.email
    };

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Session expired, please sign in again'));
    }

    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
      return next(new UnauthorizedError('Invalid access token'));
    }

    return next(error);
  }
}

async function authenticateFuncionario(req, _res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      throw new UnauthorizedError('Sessao do funcionario e obrigatoria');
    }

    const payload = jwt.verify(token, env.JWT_SECRET);
    const role = String(payload.role || '').toLowerCase();

    if (role !== 'funcionario') {
      throw new ForbiddenError('Acesso de funcionario obrigatorio');
    }

    const funcionarioId = Number(payload.sub || payload.id || 0);
    if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
      throw new UnauthorizedError('Sessao do funcionario invalida');
    }

    const funcionario = await executeOne(
      'SELECT id, cpf, nome, email, ativo FROM funcionarios WHERE id = ? LIMIT 1',
      [funcionarioId]
    );

    if (!funcionario || !funcionario.ativo) {
      throw new UnauthorizedError('Funcionario inexistente ou inativo');
    }

    req.auth = {
      id: funcionario.id,
      nome: funcionario.nome,
      role: 'funcionario',
      email: funcionario.email,
      cpf: funcionario.cpf
    };

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Sessao expirada. Faca login novamente.'));
    }

    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
      return next(new UnauthorizedError('Sessao do funcionario invalida'));
    }

    return next(error);
  }
}

module.exports = {
  authenticateAdmin,
  authenticateFuncionario,
  extractBearerToken
};
