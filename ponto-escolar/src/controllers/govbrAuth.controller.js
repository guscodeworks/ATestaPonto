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

// URL do logout do mock/fake do Gov.br usado em ambientes de desenvolvimento/teste.
function getGovbrFakeLogoutUrl() {
  const baseUrl = String(
    process.env.GOVBR_FAKE_BASE_URL || "http://127.0.0.1:4000"
  )
    .trim()
    .replace(/\/+$/, "");

  return `${baseUrl}/fake-govbr/logout`;
}

// Comparação em tempo constante para evitar timing attack na validação do state OAuth.
// O check de tamanho é necessário pois crypto.timingSafeEqual lança erro se os buffers
// tiverem tamanhos diferentes.
function matchesState(receivedState, storedState) {
  const received = Buffer.from(String(receivedState || ""), "utf8");
  const stored = Buffer.from(String(storedState || ""), "utf8");

  return (
    received.length === stored.length &&
    crypto.timingSafeEqual(received, stored)
  );
}

// Wrappers em Promise pois a API de sessão do express-session é baseada em callback.
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

// Remove os dados temporários do fluxo OAuth (state/codeVerifier) da sessão,
// evitando reuso em tentativas futuras de callback.
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

    // Validação do state contra CSRF: o valor deve corresponder ao gerado no início do fluxo.
    if (!matchesState(state, oauthSession.state)) {
      await clearOauthSession(req);
      throw new UnauthorizedError("State Gov.br invalido.");
    }

    // Dados de PKCE já cumpriram seu papel e são descartados antes da troca do code,
    // impedindo reuso em caso de callback duplicado.
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

    // Regra de negócio: apenas usuários Gov.br autorizados como admin podem acessar o painel.
    if (!verificarSeUsuarioGovbrEhAdmin(userInfo)) {
      throw new ForbiddenError("Acesso negado.");
    }

    const adminSession = {
      authProvider: "govbr",
      sub: String(userInfo.sub).trim(),
      name: String(userInfo.name || "").trim() || {},
      email: String(userInfo.email || "").trim() || {},
      loginAt: new Date().toISOString(),
    };

    // Regeneração da sessão antes de gravar dados de admin previne session fixation.
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
  // Exige sessão de admin autenticada especificamente via Gov.br (não aceita outros provedores).
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