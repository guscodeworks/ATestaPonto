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
const { verificarSeUsuarioGovbrEhAdmin } = require("../services/adminAuthorization.service");
const env = require("../config/env");
const adminUserModel = require("../models/adminUserModel");

// Logout do simulador de identidade (dev/teste).
function getGovbrFakeLogoutUrl() {
  const baseUrl = String(
    process.env.GOVBR_FAKE_BASE_URL || "http://127.0.0.1:4000"
  )
    .trim()
    .replace(/\/+$/, "");

  return `${baseUrl}/auth/logout`;
}

// timingSafeEqual exige buffers do mesmo tamanho.
function matchesState(receivedState, storedState) {
  const received = Buffer.from(String(receivedState || ""), "utf8");
  const stored = Buffer.from(String(storedState || ""), "utf8");

  return (
    received.length === stored.length &&
    crypto.timingSafeEqual(received, stored)
  );
}

// Promisifica callbacks do express-session.
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

// Descarta state/codeVerifier da sessão p/ impedir reuso em callbacks futuros.
async function clearOauthSession(req) {
  if (!req.session || !req.session.oauthGovbr) {
    return;
  }

  delete req.session.oauthGovbr;
  await saveSession(req);
}

async function iniciarLoginGovbr(req, res, next) {
  try {
    // Fluxo PKCE: state protege contra CSRF, codeVerifier/codeChallenge contra
    // interceptação do authorization code.
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
    // Callback nunca deve receber access_token diretamente na query string;
    // presença desse parâmetro indica tentativa de injeção/fluxo indevido (implicit flow).
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

    // State contra CSRF: deve bater com o gerado no início do fluxo.
    if (!matchesState(state, oauthSession.state)) {
      await clearOauthSession(req);
      throw new UnauthorizedError("State Gov.br invalido.");
    }

    // PKCE cumpriu seu papel; descarta antes da troca p/ impedir reuso em callback duplicado.
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

    const admin = await adminUserModel.findByCpf(
      userInfo.cpf
    );

    if (!admin) {
      throw new ForbiddenError(
        "Usuario Gov.br nao cadastrado como administrativo."
      );
    }

    if (!admin.ativo) {
      throw new ForbiddenError(
        "Administrativo inativo."
      );
    }

    // Autorização via banco: Gov.br só confirma a identidade; ATestaPonto confirma
    // o direito de admin (cadastrado e ativo).

    const adminSession = {
      authProvider: "govbr",
      id: admin.id, // ID do banco, não o sub do Gov.br
      sub: String(userInfo.sub).trim(),
      name: String(admin.nome || "").trim(), // pode divergir do Gov.br
      email: String(admin.email || "").trim(),
      loginAt: new Date().toISOString(),
    };

    // Regeneração da sessão antes de gravar dados de admin previne session fixation.
    await regenerateSession(req);
    req.session.admin = adminSession;
    await saveSession(req);

    await adminUserModel.updateLastLogin(admin.id);

    return res.redirect("/admin/dashboard");
  } catch (error) {
    return next(error);
  }
}

async function sairGovbr(req, res, next) {
  res.clearCookie("connect.sid", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.IS_PRODUCTION,
  });

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
  // Exige sessão de admin via Gov.br especificamente (não outros provedores).
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
