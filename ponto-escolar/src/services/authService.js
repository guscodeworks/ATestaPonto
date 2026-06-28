"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const adminModel = require("../models/adminModel");
const employeeModel = require("../models/employeeModel");
const loginModel = require("../models/loginModel");

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeCpf(value) {
  return String(value || "").replace(/\D/g, "");
}

function signToken(id, role) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });
}

async function loginAdmin(body) {
  const email = normalizeEmail(body.email);
  const senha = String(body.senha || "");

  if (!email || !senha) {
    return {};
  }

  const admin = await adminModel.findActiveCredentialsByEmail(email);
  const senhaValida = admin ? await bcrypt.compare(senha, admin.senha_hash) : false;

  if (!admin || !senhaValida) {
    return {};
  }

  const token = signToken(admin.id, "admin");
  await adminModel.updateLastLogin(admin.id);

  return { token };
}

async function loginFuncionario(body) {
  const cpf = normalizeCpf(body.cpf);
  const senha = String(body.senha || "");

  if (!cpf || !senha) {
    return {};
  }

  const login = await loginModel.findCredentialsByCpf(cpf);
  const senhaValida = login ? await bcrypt.compare(senha, login.senha) : false;

  if (!login || !senhaValida) {
    return {};
  }

  const funcionario = await employeeModel.findActiveForLegacyLoginByCpf(cpf);

  if (!funcionario) {
    return {};
  }

  return {
    token: signToken(funcionario.id, "funcionario"),
    primeiro_acesso: Boolean(funcionario.primeiro_acesso),
  };
}

module.exports = {
  loginAdmin,
  loginFuncionario,
};
