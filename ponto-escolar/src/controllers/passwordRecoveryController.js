"use strict";

const passwordRecoveryService = require("../services/passwordRecoveryService");
const { getClientIp } = require("../utils/request");

async function requestRecovery(req, res, next) {
  try {
    const data = await passwordRecoveryService.requestRecovery({
      cpf: req.body.cpf,
      session: req.session,
      ipOrigem: getClientIp(req),
    });
    return res.status(202).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function verifyRecoveryCode(req, res, next) {
  try {
    const data = passwordRecoveryService.verifyRecoveryCode({
      codigo: req.body.codigo,
      session: req.session,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const data = await passwordRecoveryService.resetPassword({
      novaSenha: req.body.novaSenha,
      session: req.session,
      ipOrigem: getClientIp(req),
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

module.exports = { requestRecovery, verifyRecoveryCode, resetPassword };
