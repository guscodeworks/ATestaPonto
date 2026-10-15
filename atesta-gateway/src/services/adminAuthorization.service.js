"use strict";

const { readAdminIdentity, readAdminForLogin, updateLastLogin } = require("./adminIdentityService");
const { ForbiddenError } = require("../utils/errors");

// Resolve no Spring a identidade administrativa associada ao CPF autenticado
// pelo Gov.br. A decisão de autorização permanece interna ao Ponto Escolar.
async function obterAdminParaLoginGovbr(cpf) {
  const admin = await readAdminForLogin(cpf);
  if (!admin) return null;

  const { admin: adminAtual, acessos } = await obterContextoAutorizacaoAdmin(admin.id);
  if (!adminAtual || !adminAtual.ativo) return null;
  if (acessos.length === 0) {
    throw new ForbiddenError("Administrativo sem acessos administrativos ativos");
  }

  return admin;
}

async function registrarUltimoLoginAdmin(adminId) {
  return updateLastLogin(adminId);
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
