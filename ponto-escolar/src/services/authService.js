"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const employeeModel = require("../models/employeeModel");
const loginModel = require("../models/loginModel");

function normalizeCpf(value) {
  return String(value || "").replace(/\D/g, "");
}

function signToken(id, role) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });
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

  await loginModel.updateLastLogin(funcionario.id);

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
  loginFuncionario,
};
