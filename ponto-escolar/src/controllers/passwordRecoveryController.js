"use strict";

const passwordRecoveryService = require("../services/passwordRecoveryService");
const { getClientIp } = require("../utils/request");
const { performance } = require("node:perf_hooks");
const { setTimeout: delay } = require("node:timers/promises");

const MIN_RECOVERY_RESPONSE_MS = 300;

async function requestRecovery(req, res, next) {
  try {
    const startedAt = performance.now();
    const { data, deliver } = await passwordRecoveryService.requestRecovery({
      cpf: req.body.cpf,
      session: req.session,
      ipOrigem: getClientIp(req),
    });
    // Salva nos dois casos, inclusive conta inexistente. Não envia código se falhar.
    await new Promise((resolve, reject) => {
      req.session.save((error) => error ? reject(error) : resolve());
    });
    await delay(Math.max(0, MIN_RECOVERY_RESPONSE_MS - (performance.now() - startedAt)));
    res.once("finish", () => { setImmediate(() => { void deliver(); }); });
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
      sessionId: req.sessionID,
      sessionStore: req.sessionStore,
      ipOrigem: getClientIp(req),
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

module.exports = { requestRecovery, verifyRecoveryCode, resetPassword };
