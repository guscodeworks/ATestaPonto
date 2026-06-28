"use strict";

const authService = require("../services/authService");
const {
  buildAdminAuthCookie,
  buildClearAdminAuthCookie,
} = require("../utils/authCookie");

async function loginAdmin(req, res, next) {
  try {
    const unauthorizedMessage = "E-mail ou senha incorretos";
    const result = await authService.loginAdmin(req.body);

    if (!result.token) {
      return res.status(401).json({ message: unauthorizedMessage });
    }

    res.setHeader("Set-Cookie", buildAdminAuthCookie(result.token));

    return res.status(200).json({
      token: result.token,
    });
  } catch (error) {
    return next(error);
  }
}

async function loginFuncionario(req, res, next) {
  try {
    const unauthorizedMessage = "CPF ou senha incorretos";
    const result = await authService.loginFuncionario(req.body);

    if (!result.token) {
      return res.status(401).json({ message: unauthorizedMessage });
    }

    return res.status(200).json({
      token: result.token,
      primeiro_acesso: result.primeiro_acesso,
    });
  } catch (error) {
    return next(error);
  }
}

function getGovbrFakeHomeUrl() {
  return String(
    process.env.GOVBR_FAKE_BASE_URL || "http://127.0.0.1:4000"
  ).trim();
}

function logoutAdmin(req, res) {
  res.setHeader("Set-Cookie", buildClearAdminAuthCookie());
  res.clearCookie("connect.sid", { path: "/" });

  if (req.session && typeof req.session.destroy === "function") {
    req.session.destroy(() => {});
  }

  const redirectTo = getGovbrFakeHomeUrl();

  if (req.method === "GET") {
    return res.redirect(redirectTo);
  }

  return res.status(200).json({
    message: "Logout realizado com sucesso",
    redirectTo,
  });
}

module.exports = {
  loginAdmin,
  loginFuncionario,
  logoutAdmin,
};
