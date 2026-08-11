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

      // Admin válido - define req.user e req.auth com dados reais do banco
      req.user = {
        id: adminFromDb.id,
        funcionariosId: adminFromDb.funcionario_id,
        govbrSub: adminFromDb.govbr_sub,
        email: adminFromDb.email,
        nome: adminFromDb.nome,
        ultimoLoginEm: adminFromDb.ultimo_login_em,
        criadoEm: adminFromDb.criado_em,
        atualizadoEm: adminFromDb.atualizado_em,
        ativo: adminFromDb.ativo,
      };

      req.auth = {
        id: adminFromDb.id,
        sub: adminFromDb.govbr_sub,
        nome: adminFromDb.nome || "",
        email: adminFromDb.email,
        role: "admin",
        authProvider: "govbr",
      };

      return next();
    })
    .catch((error) => {
      return next(
        new UnauthorizedError("Falha ao validar sessao administrativa")
      );
    });
}

module.exports = ensureAdminApiAuthenticated;
