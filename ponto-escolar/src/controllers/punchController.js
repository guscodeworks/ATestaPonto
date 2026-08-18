"use strict";

const punchService = require("../services/punchService");
const { getClientIp, getClientUserAgent } = require("../utils/request");

async function loginFuncionario(req, res, next) {
  try {
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

async function changeFirstAccessPassword(req, res, next) {
  try {
    const result = await punchService.changeFirstAccessPassword(
      req.auth.id,
      req.body.nova_senha,
      { ipOrigem: getClientIp(req) }
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getTodayPunch(req, res, next) {
  try {
    const result = await punchService.getTodayPunch(req.auth.id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getPunchHistory(req, res, next) {
  try {
    const result = await punchService.getPunchHistory(req.auth.id, req.query.mes);

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
    const result = await punchService.registerPunch(
      {
        funcionarioId: req.auth.id,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
      },
      {
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
  getPunchHistory,
  getTodayPunch,
  loginFuncionario,
  changeFirstAccessPassword,
  registerPunch,
};
