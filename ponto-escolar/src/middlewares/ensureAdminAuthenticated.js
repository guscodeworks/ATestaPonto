"use strict";

const usuarioAdministrativoModel = require("../models/usuarioAdministrativoModel");

/**
 * Protege paginas admin: Gov.br autentica, ATestaPonto autoriza.
 */
function ensureAdminAuthenticated(req, res, next) {
  const adminSession = req.session && req.session.admin;

  // Verifica se existe sessao administrativa Gov.br
  if (
    !adminSession ||
    adminSession.authProvider !== "govbr" ||
    !adminSession.id
  ) {
    return res.redirect("/auth/govbr/login");
  }

  // Busca o administrativo real no banco para validar se ainda existe e esta ativo
  usuarioAdministrativoModel
    .findById(adminSession.id)
    .then((adminFromDb) => {
      if (!adminFromDb) {
        return res.redirect("/auth/govbr/login");
      }

      if (!adminFromDb.ativo) {
        return res.redirect("/auth/govbr/login");
      }

      // Admin válido - busca seus acessos ativos
      return usuarioAdministrativoModel
        .findAcessosAtivosPorUsuario(adminFromDb.id)
        .then((acessos) => {
          // Admin válido - define req.user com dados reais do banco.
          // usuarios_administrativos não possui funcionario_id nem govbr_sub
          // (cpf-keyed); apenas campos reais são expostos.
          req.user = {
            id: adminFromDb.id,
            email: adminFromDb.email,
            nome: adminFromDb.nome,
            ultimoLoginEm: adminFromDb.ultimo_login_em,
            criadoEm: adminFromDb.criado_em,
            atualizadoEm: adminFromDb.atualizado_em,
            ativo: adminFromDb.ativo,
          };

          // Disponibiliza os acessos ativos no request
          req.acessos = acessos || [];

          // Determina o contexto/perfil aplicável (primeiro acesso ativo por padrão)
          req.contextoAdmin = acessos && acessos.length > 0 ? acessos[0] : null;

          return next();
        });
    })
    .catch((error) => {
      return res.redirect("/auth/govbr/login");
    });
}

module.exports = ensureAdminAuthenticated;
