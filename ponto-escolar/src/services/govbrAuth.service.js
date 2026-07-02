"use strict";

const { getGovbrConfig } = require("../config/govbr");

function getRequiredParameter(value, name) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`Parametro obrigatorio nao informado: ${name}.`);
  }

  return normalized;
}

// Tenta extrair a mensagem de erro do corpo JSON do Gov.br (formatos comuns de
// erro OAuth) antes de recorrer a uma mensagem genérica, para facilitar o
// diagnóstico de falhas de integração.
async function parseJsonResponse(response, operation) {
  let data;

  try {
    data = await response.json();
  } catch (_error) {
    if (!response.ok) {
      throw new Error(
        `Falha do Gov.br ao ${operation} (HTTP ${response.status}).`
      );
    }

    throw new Error(`Resposta invalida do Gov.br ao ${operation}.`);
  }

  if (!response.ok) {
    const detail =
      data && typeof data === "object"
        ? data.error_description || data.error || data.message
        : "";
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(
      `Falha do Gov.br ao ${operation} (HTTP ${response.status})${suffix}`
    );
  }

  return data;
}

function buildAuthorizeUrl({ state, codeChallenge }) {
  const config = getGovbrConfig();
  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid email profile",
    state: getRequiredParameter(state, "state"),
    // PKCE: code_challenge_method fixo em S256, já que é o método recomendado
    // (mais seguro que "plain") e o único suportado por este fluxo.
    code_challenge: getRequiredParameter(codeChallenge, "codeChallenge"),
    code_challenge_method: "S256",
  }).toString();

  return authorizeUrl.toString();
}

async function trocarCodePorToken({ code, codeVerifier }) {
  const config = getGovbrConfig();
  // Client authentication via HTTP Basic (client_id:client_secret em base64),
  // exigido pelo Gov.br além do client_secret também enviado no corpo.
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
    "utf8"
  ).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: getRequiredParameter(code, "code"),
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code_verifier: getRequiredParameter(codeVerifier, "codeVerifier"),
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return parseJsonResponse(response, "trocar o codigo por token");
}

async function buscarUserInfo(accessToken) {
  const config = getGovbrConfig();
  const token = getRequiredParameter(accessToken, "accessToken");

  const response = await fetch(config.userInfoUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseJsonResponse(response, "consultar userinfo");
}

module.exports = {
  buildAuthorizeUrl,
  trocarCodePorToken,
  buscarUserInfo,
};