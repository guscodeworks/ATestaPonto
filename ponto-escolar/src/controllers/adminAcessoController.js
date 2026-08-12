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

// Contexto do admin autenticado: seus próprios acessos ativos + escopo efetivo.
// Leitura pura — resolve tudo em memória a partir do que o middleware já montou
// (req.acessos, req.escopo, req.escopoUnidades); nada de novo model/DB.
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

// Handler genérico do ciclo de vida: delega a ação (suspender/reativar/revogar)
// ao service. Controller não conhece perfis/escopo — apenas repassa o contexto
// de auditoria (quem, de onde, acessos/escopo do concedente). A factory NÃO é
// async (retorna o handler síncrono); só o handler interno é async.
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
