"use strict";

const adminUserModel = require("../models/adminUserModel");
const { readAdminIdentity, readAdminForLogin } = require("./adminIdentityService");

// Resolve no Spring a identidade administrativa associada ao CPF autenticado
// pelo Gov.br. A decisão de autorização permanece interna ao Ponto Escolar.
async function obterAdminParaLoginGovbr(cpf) {
  return readAdminForLogin(cpf);
}

async function registrarUltimoLoginAdmin(adminId) {
  return adminUserModel.updateLastLogin(adminId);
}

// Revalida identidade/acessos no Spring; sessao, RBAC e escopo permanecem no Node.
// Erros sao propagados para os middlewares existentes aplicarem fail-closed.
async function obterContextoAutorizacaoAdmin(adminId) {
  return readAdminIdentity(adminId);
}

module.exports = {
  obterAdminParaLoginGovbr,
  registrarUltimoLoginAdmin,
  obterContextoAutorizacaoAdmin,
};
