"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const adminModel = require("../models/adminModel");
const { BadRequestError, UnauthorizedError } = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function loginAdmin(body, { ipOrigem } = {}) {
  const email = normalizeEmail(body.email);
  const senha = String(body.senha || "");

  if (!email || !senha) {
    throw new BadRequestError("Email e senha sao obrigatorios");
  }

  const admin = await adminModel.findByEmail(email);
  const senhaCorreta = admin ? await bcrypt.compare(senha, admin.senha_hash) : false;

  if (!admin || !senhaCorreta || !admin.ativo) {
    await registerAuditLog({
      evento: "admin_login_invalido",
      nivel: "WARN",
      mensagem: "Tentativa de login admin invalida",
      ipOrigem,
      metadados: { email },
    });
    throw new UnauthorizedError("Credenciais invalidas");
  }

  const token = jwt.sign(
    {
      sub: String(admin.id),
      role: "admin",
      email: admin.email,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  await adminModel.updateLastLogin(admin.id);

  await registerAuditLog({
    evento: "admin_login_sucesso",
    adminId: admin.id,
    mensagem: "Login de admin realizado com sucesso",
    ipOrigem,
  });

  return {
    token,
    expiresIn: env.JWT_EXPIRES_IN,
    admin: {
      id: admin.id,
      nome: admin.nome,
      email: admin.email,
    },
  };
}

async function getAdminProfile(adminId) {
  const admin = await adminModel.findProfileById(adminId);

  if (!admin) {
    throw new UnauthorizedError("Administrador nao encontrado");
  }

  return {
    admin: {
      id: admin.id,
      nome: admin.nome,
      email: admin.email,
      ativo: Boolean(admin.ativo),
      ultimo_login_em: admin.ultimo_login_em,
      criado_em: admin.criado_em,
    },
  };
}

module.exports = {
  loginAdmin,
  getAdminProfile,
};
