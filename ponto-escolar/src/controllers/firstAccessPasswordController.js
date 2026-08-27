"use strict";

const firstAccessPasswordService = require("../services/firstAccessPasswordService");
const { extractBearerToken } = require("../middlewares/authMiddleware");
const { getClientIp } = require("../utils/request");

async function changeFirstAccessPassword(req, res, next) {
  try {
    const data = await firstAccessPasswordService.changeFirstAccessPassword({
      token: extractBearerToken(req),
      novaSenha: req.body.novaSenha,
      ipOrigem: getClientIp(req),
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

module.exports = { changeFirstAccessPassword };
