"use strict";

const { getGovbrConfig } = require("../config/govbr");
const adminUserModel = require("../models/adminUserModel");
const { readAdminIdentity, readAdminForLogin } = require("./adminIdentityService");

// Autorização fica interna: o provedor (Gov.br) nunca define perfil admin aqui.
function verificarSeUsuarioGovbrEhAdmin(userInfo) {
  const { adminSubs, adminEmails } = getGovbrConfig();
  const userSub = String((userInfo && userInfo.sub) || "").trim();
  const userEmail = String((userInfo && userInfo.email) || "")
    .trim()
    .toLowerCase();

  return Boolean(
    (userSub && adminSubs.includes(userSub)) ||
      (userEmail && adminEmails.includes(userEmail))
  );
}

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
  verificarSeUsuarioGovbrEhAdmin,
  obterAdminParaLoginGovbr,
  registrarUltimoLoginAdmin,
  obterContextoAutorizacaoAdmin,
};
