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

// Diferente do fluxo de admin visto no authService.js (que lança BadRequestError/
// UnauthorizedError), aqui qualquer falha de validação ou credencial invalida
// retorna um objeto vazio ({}) em vez de lançar erro.
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

  // Credenciais (tabela login) e dados do funcionario (tabela funcionarios) ficam
  // em modelos separados; um login valido nao garante que o funcionario vinculado
  // ainda esteja ativo, entao essa checagem e feita em uma segunda consulta.
  const funcionario = await employeeModel.findActiveForLegacyLoginByCpf(cpf);

  if (!funcionario) {
    return {};
  }

  return {
    token: signToken(funcionario.id, "funcionario"),
    primeiro_acesso: Boolean(funcionario.primeiro_acesso),
  };
}

async function findUserByToken(funcionarioId) {
  return employeeModel.findById(funcionarioId);
}

module.exports = {
  findUserByToken,
  loginAdmin,
  loginFuncionario,
};