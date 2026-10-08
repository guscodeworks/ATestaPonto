"use strict";

const { obterContextoAutorizacaoAdmin } = require("../services/adminAuthorization.service");

async function revalidateAdminContext(req, adminId) {
  const { admin, acessos } = await obterContextoAutorizacaoAdmin(adminId);
  if (!admin || !admin.ativo) return admin;

  req.user = {
    id: admin.id,
    email: admin.email,
    nome: admin.nome,
    ultimoLoginEm: admin.ultimo_login_em,
    criadoEm: admin.criado_em,
    atualizadoEm: admin.atualizado_em,
    ativo: admin.ativo,
  };
  req.acessos = acessos || [];
  req.contextoAdmin = acessos && acessos.length > 0 ? acessos[0] : null;
  return admin;
}

module.exports = { revalidateAdminContext };
