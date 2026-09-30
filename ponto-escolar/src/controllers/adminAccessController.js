"use strict";

const adminAccessService = require("../services/adminAccessService");
const { CAPACIDADES_POR_PERFIL } = require("../utils/adminCapabilities");
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
    const result = await adminAccessService.createAcesso(
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

// /meu: usa os acessos ativos autorizadores e o escopo resolvido pelo middleware.
async function getMeusAcessos(req, res, next) {
  try {
    const result = adminAccessService.getMeusAcessos({
      escopo: req.escopo,
      acessos: req.acessosAutorizadores,
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

function getCapacidadesPorPerfil(_req, res) {
  res.set("Cache-Control", "no-store");
  return res.status(200).json({
    success: true,
    data: {
      perfis: Object.entries(CAPACIDADES_POR_PERFIL).map(
        ([perfil, capacidades]) => ({ perfil, capacidades })
      ),
    },
  });
}

async function getConcessionOptions(req, res, next) {
  try {
    const result = await adminAccessService.listConcessionOptions(
      req.acessosAutorizadores
    );
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}

async function listAcessos(req, res, next) {
  try {
    const result = await adminAccessService.listAcessos(req.query, {
      escopo: req.escopo,
      escopoUnidades: req.escopoUnidades,
      acessos: req.acessos,
      adminId: req.auth.id,
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
    const result = await adminAccessService.getAcesso(
      Number(req.params.id),
      { acessos: req.acessos }
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
      const result = await adminAccessService.alterarStatus(
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
  getCapacidadesPorPerfil,
  getConcessionOptions,
  listAcessos,
  getAcesso,
  suspenderAcesso,
  reativarAcesso,
  revogarAcesso,
};
