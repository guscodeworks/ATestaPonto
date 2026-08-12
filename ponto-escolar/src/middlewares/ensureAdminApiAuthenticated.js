"use strict";

const { ForbiddenError, UnauthorizedError } = require("../utils/errors");
const usuarioAdministrativoModel = require("../models/usuarioAdministrativoModel");

/**
 * Protege APIs administrativas com sessao Gov.br e autorizacao interna.
 */
function ensureAdminApiAuthenticated(req, _res, next) {
  const adminSession = req.session && req.session.admin;

  // Verifica se existe sessao administrativa Gov.br
  if (
    !adminSession ||
    adminSession.authProvider !== "govbr" ||
    !adminSession.id
  ) {
    return next(
      new UnauthorizedError("Sessao administrativa Gov.br obrigatoria")
    );
  }

  // Busca o administrativo real no banco para validar se ainda existe e esta ativo
  usuarioAdministrativoModel
    .findById(adminSession.id)
    .then((adminFromDb) => {
      if (!adminFromDb) {
        return next(
          new UnauthorizedError("Administrativo nao encontrado no sistema")
        );
      }

      if (!adminFromDb.ativo) {
        return next(
          new ForbiddenError("Administrativo inativo")
        );
      }

      // Admin válido - busca seus acessos ativos
      return usuarioAdministrativoModel
        .findAcessosAtivosPorUsuario(adminFromDb.id)
        .then((acessos) => {
          // Admin válido - define req.user e req.auth com dados reais do banco.
          // usuarios_administrativos não possui funcionario_id nem govbr_sub
          // (cpf-keyed); apenas campos reais são expostos. req.auth.id é
          // consumido por controllers administrativos e deve ser preservado.
          req.user = {
            id: adminFromDb.id,
            email: adminFromDb.email,
            nome: adminFromDb.nome,
            ultimoLoginEm: adminFromDb.ultimo_login_em,
            criadoEm: adminFromDb.criado_em,
            atualizadoEm: adminFromDb.atualizado_em,
            ativo: adminFromDb.ativo,
          };

          req.auth = {
            id: adminFromDb.id,
            nome: adminFromDb.nome || "",
            email: adminFromDb.email,
            role: "admin",
            authProvider: "govbr",
          };

          // Disponibiliza os acessos ativos no request
          req.acessos = acessos || [];

          // Determina o contexto/perfil aplicável (primeiro acesso ativo por padrão)
          // Em uma implementação real, isso poderia ser baseado em seleção do usuário ou outras regras
          req.contextoAdmin = acessos && acessos.length > 0 ? acessos[0] : null;

          return next();
        });
    })
    .catch((error) => {
      return next(
        new UnauthorizedError("Falha ao validar sessao administrativa")
      );
    });
}

module.exports = ensureAdminApiAuthenticated;
