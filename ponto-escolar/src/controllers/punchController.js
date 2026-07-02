"use strict";

const punchService = require("../services/punchService");
const { getClientIp, getClientUserAgent } = require("../utils/request");

async function loginFuncionario(req, res, next) {
  try {
    // IP de origem é registrado para fins de auditoria/rastreabilidade do login.
    const result = await punchService.loginFuncionario(req.body, {
      ipOrigem: getClientIp(req),
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function registerPunch(req, res, next) {
  try {
    // funcionarioId vem do middleware de autenticação (req.auth), não do body,
    // evitando que o funcionário registre ponto em nome de outro.
    const result = await punchService.registerPunch(
      {
        funcionarioId: req.auth.id,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
      },
      {
        // IP e User-Agent registrados para auditoria/comprovação do registro de ponto.
        ipOrigem: getClientIp(req),
        userAgent: getClientUserAgent(req),
      }
    );

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  loginFuncionario,
  registerPunch,
};