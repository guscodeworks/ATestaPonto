'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { buildAdminAuthCookie, buildClearAdminAuthCookie } = require('../utils/authCookie');

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function signToken(id, role) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  });
}

async function loginAdmin(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    const unauthorizedMessage = 'E-mail ou senha incorretos';

    if (!email || !senha) {
      return res.status(401).json({ message: unauthorizedMessage });
    }

    const [admins] = await pool.execute(
      'SELECT id, email, senha_hash FROM admins WHERE email = ? AND ativo = 1 LIMIT 1',
      [email]
    );
    const admin = admins[0];
    const senhaValida = admin ? await bcrypt.compare(senha, admin.senha_hash) : false;

    if (!admin || !senhaValida) {
      return res.status(401).json({ message: unauthorizedMessage });
    }

    const token = signToken(admin.id, 'admin');

    await pool.execute('UPDATE admins SET ultimo_login_em = NOW() WHERE id = ?', [admin.id]);
    res.setHeader('Set-Cookie', buildAdminAuthCookie(token));

    return res.status(200).json({
      token
    });
  } catch (error) {
    return next(error);
  }
}

async function loginFuncionario(req, res, next) {
  try {
    const cpf = normalizeCpf(req.body.cpf);
    const senha = String(req.body.senha || '');
    const unauthorizedMessage = 'CPF ou senha incorretos';

    if (!cpf || !senha) {
      return res.status(401).json({ message: unauthorizedMessage });
    }

    const [logins] = await pool.execute('SELECT id, cpf, senha FROM login WHERE cpf = ? LIMIT 1', [cpf]);
    const login = logins[0];
    const senhaValida = login ? await bcrypt.compare(senha, login.senha) : false;

    if (!login || !senhaValida) {
      return res.status(401).json({ message: unauthorizedMessage });
    }

    const [funcionarios] = await pool.execute(
      'SELECT id, cpf, nome, primeiro_acesso FROM funcionarios WHERE cpf = ? AND ativo = 1 LIMIT 1',
      [cpf]
    );
    const funcionario = funcionarios[0];

    if (!funcionario) {
      return res.status(401).json({ message: unauthorizedMessage });
    }

    const token = signToken(funcionario.id, 'funcionario');

    return res.status(200).json({
      token,
      primeiro_acesso: Boolean(funcionario.primeiro_acesso)
    });
  } catch (error) {
    return next(error);
  }
}

function getGovbrFakeHomeUrl() {
  return String(process.env.GOVBR_FAKE_BASE_URL || 'http://localhost:4000').trim();
}

function logoutAdmin(req, res) {
  res.setHeader('Set-Cookie', buildClearAdminAuthCookie());
  res.clearCookie('connect.sid', { path: '/' });

  if (req.session && typeof req.session.destroy === 'function') {
    req.session.destroy(() => {});
  }

  const redirectTo = getGovbrFakeHomeUrl();

  if (req.method === 'GET') {
    return res.redirect(redirectTo);
  }

  return res.status(200).json({
    message: 'Logout realizado com sucesso',
    redirectTo
  });
}

module.exports = {
  loginAdmin,
  loginFuncionario,
  logoutAdmin
};
