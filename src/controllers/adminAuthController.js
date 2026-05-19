const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { execute, executeOne } = require('../config/database');
const { BadRequestError, UnauthorizedError } = require('../utils/errors');
const { registerAuditLog } = require('../services/auditLogService');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || null;
}

async function loginAdmin(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');

    if (!email || !senha) {
      throw new BadRequestError('Email e senha sao obrigatorios');
    }

    const admin = await executeOne(
      'SELECT id, nome, email, senha_hash, ativo FROM admins WHERE email = ? LIMIT 1',
      [email]
    );

    const senhaCorreta = admin ? await bcrypt.compare(senha, admin.senha_hash) : false;
    if (!admin || !senhaCorreta || !admin.ativo) {
      await registerAuditLog({
        evento: 'admin_login_invalido',
        nivel: 'WARN',
        mensagem: 'Tentativa de login admin invalida',
        ipOrigem: getClientIp(req),
        metadados: { email }
      });
      throw new UnauthorizedError('Credenciais invalidas');
    }

    const token = jwt.sign(
      {
        sub: String(admin.id),
        role: 'admin',
        email: admin.email
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    await execute('UPDATE admins SET ultimo_login_em = NOW() WHERE id = ?', [admin.id]);

    await registerAuditLog({
      evento: 'admin_login_sucesso',
      adminId: admin.id,
      mensagem: 'Login de admin realizado com sucesso',
      ipOrigem: getClientIp(req)
    });

    return res.status(200).json({
      success: true,
      data: {
        token,
        expiresIn: env.JWT_EXPIRES_IN,
        admin: {
          id: admin.id,
          nome: admin.nome,
          email: admin.email
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function getAdminProfile(req, res, next) {
  try {
    const admin = await executeOne(
      'SELECT id, nome, email, ativo, ultimo_login_em, criado_em FROM admins WHERE id = ? LIMIT 1',
      [req.auth.id]
    );

    if (!admin) {
      throw new UnauthorizedError('Administrador nao encontrado');
    }

    return res.status(200).json({
      success: true,
      data: {
        admin: {
          id: admin.id,
          nome: admin.nome,
          email: admin.email,
          ativo: Boolean(admin.ativo),
          ultimo_login_em: admin.ultimo_login_em,
          criado_em: admin.criado_em
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  loginAdmin,
  getAdminProfile
};
