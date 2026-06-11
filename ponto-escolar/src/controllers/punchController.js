"use strict";

const punchService = require("../services/punchService");

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")?.[0]?.trim() || req.ip || null
  );
}

function getClientUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 255) || null;
}

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
  loginFuncionario,
  registerPunch,
};
