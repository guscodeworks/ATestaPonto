"use strict";

const crypto = require("crypto");
const {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} = require("../utils/errors");
const { gerarTextoSeguro, gerarCodeChallenge } = require("../utils/pkce.util");
const {
  buildAuthorizeUrl,
  trocarCodePorToken,
  buscarUserInfo,
} = require("../services/govbrAuth.service");
const {
  verificarSeUsuarioGovbrEhAdmin,
} = require("../services/adminAuthorization.service");
const { buildClearAdminAuthCookie } = require("../utils/authCookie");

function getGovbrFakeLogoutUrl() {
  const baseUrl = String(
    process.env.GOVBR_FAKE_BASE_URL || "http://localhost:4000"
  )
    .trim()
    .replace(/\/+$/, "");

  return `${baseUrl}/fake-govbr/logout`;
}

function matchesState(receivedState, storedState) {
  const received = Buffer.from(String(receivedState || ""), "utf8");
  const stored = Buffer.from(String(storedState || ""), "utf8");

  return (
    received.length === stored.length &&
    crypto.timingSafeEqual(received, stored)
  );
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function clearOauthSession(req) {
  if (!req.session || !req.session.oauthGovbr) {
    return;
  }

  delete req.session.oauthGovbr;
  await saveSession(req);
}

async function iniciarLoginGovbr(req, res, next) {
  try {
    const state = gerarTextoSeguro();
    const codeVerifier = gerarTextoSeguro();
    const codeChallenge = gerarCodeChallenge(codeVerifier);

    req.session.oauthGovbr = {
      state,
      codeVerifier,
    };

    await saveSession(req);
    return res.redirect(buildAuthorizeUrl({ state, codeChallenge }));
  } catch (error) {
    return next(error);
  }
}

async function concluirLoginGovbr(req, res, next) {
  try {
    if ("access_token" in req.query) {
      await clearOauthSession(req);
      throw new BadRequestError(
        "Access token nao e aceito no callback de autenticacao."
      );
    }

    if (req.query.error) {
      await clearOauthSession(req);
      throw new UnauthorizedError("Autenticacao Gov.br nao concluida.");
    }

    const code = String(req.query.code || "").trim();
    const state = String(req.query.state || "").trim();
    const oauthSession = req.session && req.session.oauthGovbr;

    if (!code || !state || !oauthSession) {
      await clearOauthSession(req);
      throw new BadRequestError(
        "Callback Gov.br sem dados de autenticacao validos."
      );
    }

    if (!matchesState(state, oauthSession.state)) {
      await clearOauthSession(req);
      throw new UnauthorizedError("State Gov.br invalido.");
    }

    await clearOauthSession(req);

    const tokenResponse = await trocarCodePorToken({
      code,
      codeVerifier: oauthSession.codeVerifier,
    });
    const accessToken = String(
      (tokenResponse && tokenResponse.access_token) || ""
    ).trim();

    if (!accessToken) {
      throw new UnauthorizedError(
        "Gov.br nao retornou token de acesso valido."
      );
    }

    const userInfo = await buscarUserInfo(accessToken);

    if (!verificarSeUsuarioGovbrEhAdmin(userInfo)) {
      throw new ForbiddenError("Acesso negado.");
    }

    const adminSession = {
      authProvider: "govbr",
      sub: String(userInfo.sub).trim(),
      name: String(userInfo.name || "").trim() || null,
      email: String(userInfo.email || "").trim() || null,
      loginAt: new Date().toISOString(),
    };

    await regenerateSession(req);
    req.session.admin = adminSession;
    await saveSession(req);

    return res.redirect("/admin/dashboard");
  } catch (error) {
    return next(error);
  }
}

async function sairGovbr(req, res, next) {
  res.setHeader("Set-Cookie", buildClearAdminAuthCookie());
  res.clearCookie("connect.sid", { path: "/" });

  if (!req.session) {
    return res.redirect(getGovbrFakeLogoutUrl());
  }

  try {
    delete req.session.admin;
    delete req.session.oauthGovbr;
    await destroySession(req);

    return res.redirect(getGovbrFakeLogoutUrl());
  } catch (error) {
    return next(error);
  }
}

function consultarSessaoAdmin(req, res) {
  if (
    !req.session ||
    !req.session.admin ||
    req.session.admin.authProvider !== "govbr"
  ) {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sessao administrativa nao autenticada.",
      },
    });
  }

  const admin = req.session.admin;

  return res.status(200).json({
    success: true,
    data: {
      admin: {
        ...admin,
        nome: admin.name,
      },
    },
  });
}

module.exports = {
  iniciarLoginGovbr,
  concluirLoginGovbr,
  sairGovbr,
  consultarSessaoAdmin,
};
