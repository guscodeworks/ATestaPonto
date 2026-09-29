"use strict";

const { getGovbrConfig } = require("../config/govbr");
const adminUserModel = require("../models/adminUserModel");

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

// Resolve no banco a identidade administrativa associada ao CPF autenticado
// pelo Gov.br. A decisão de autorização permanece interna ao Ponto Escolar.
async function obterAdminParaLoginGovbr(cpf) {
  return adminUserModel.findByCpf(cpf);
}

async function registrarUltimoLoginAdmin(adminId) {
  return adminUserModel.updateLastLogin(adminId);
}

// Revalida a sessão contra o banco em toda requisição protegida. A consulta de
// acessos só ocorre para um administrativo existente e ativo; qualquer erro é
// propagado para os middlewares aplicarem fail-closed.
async function obterContextoAutorizacaoAdmin(adminId) {
  const admin = await adminUserModel.findById(adminId);
  if (!admin || !admin.ativo) {
    return { admin, acessos: [] };
  }

  const acessos = await adminUserModel.findAcessosAtivosPorUsuario(admin.id);
  return { admin, acessos: acessos || [] };
}

module.exports = {
  verificarSeUsuarioGovbrEhAdmin,
  obterAdminParaLoginGovbr,
  registrarUltimoLoginAdmin,
  obterContextoAutorizacaoAdmin,
};
