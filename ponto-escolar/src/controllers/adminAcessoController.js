"use strict";

const acessoAdministrativoService = require("../services/acessoAdministrativoService");
const { getClientIp } = require("../utils/request");

// Contexto de auditoria: quem concedeu e de onde.
function getAuditContext(req) {
  return {
    adminId: req.auth.id,
    ipOrigem: getClientIp(req),
    escopo: req.escopo,
    acessos: req.acessos,
  };
}

async function createAcesso(req, res, next) {
  try {
    const result = await acessoAdministrativoService.createAcesso(
      req.body,
      getAuditContext(req)
    );

    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

// /meu: leitura pura em memória (req.acessos/escopo/escopoUnidades), sem model/DB.
async function getMeusAcessos(req, res, next) {
  try {
    const result = acessoAdministrativoService.getMeusAcessos({
      escopo: req.escopo,
      acessos: req.acessos,
      escopoUnidades: req.escopoUnidades,
    });

    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function listAcessos(req, res, next) {
  try {
    const result = await acessoAdministrativoService.listAcessos(req.query, {
      escopo: req.escopo,
      escopoUnidades: req.escopoUnidades,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getAcesso(req, res, next) {
  try {
    const result = await acessoAdministrativoService.getAcesso(
      Number(req.params.id),
      { escopo: req.escopo }
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

// Factory de handler: só repassa o contexto de auditoria ao service (controller
// não conhece perfis/escopo). NÃO é async — retorna o handler async.
function alterarStatusAcesso(acao) {
  return async function handler(req, res, next) {
    try {
      const result = await acessoAdministrativoService.alterarStatus(
        Number(req.params.id),
        acao,
        getAuditContext(req)
      );

      res.set("Cache-Control", "no-store");
      res.set("Pragma", "no-cache");
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  };
}

const suspenderAcesso = alterarStatusAcesso("suspender");
const reativarAcesso = alterarStatusAcesso("reativar");
const revogarAcesso = alterarStatusAcesso("revogar");

module.exports = {
  createAcesso,
  getMeusAcessos,
  listAcessos,
  getAcesso,
  suspenderAcesso,
  reativarAcesso,
  revogarAcesso,
};
