"use strict";

const { getGovbrConfig } = require("../config/govbr");

function getRequiredParameter(value, name) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`Parametro obrigatorio nao informado: ${name}.`);
  }

  return normalized;
}

function providerError(code, operation, upstreamStatus) {
  const error = new Error('Falha na comunicacao com Gov.br.');
  error.code = code;
  error.operation = operation;
  error.upstreamStatus = upstreamStatus;
  return error;
}

async function requestGovbr(url, options, operation) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (_error) {
    throw providerError('OAUTH_NETWORK_ERROR', operation);
  }
  return parseJsonResponse(response, operation);
}

// Respostas externas podem ecoar credenciais: preserve só operação e status.
async function parseJsonResponse(response, operation) {
  let data;

  try {
    data = await response.json();
  } catch (_error) {
    if (!response.ok) {
      throw providerError('OAUTH_UPSTREAM_ERROR', operation, response.status);
    }

    throw providerError('OAUTH_INVALID_RESPONSE', operation, response.status);
  }

  if (!response.ok) {
    throw providerError('OAUTH_UPSTREAM_ERROR', operation, response.status);
  }

  return data;
}

// PKCE mantém o token fora da URL.
function buildAuthorizeUrl({ state, codeChallenge }) {
  const config = getGovbrConfig();
  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid email profile",
    state: getRequiredParameter(state, "state"),
    // S256: mais seguro que "plain" e único suportado por este fluxo.
    code_challenge: getRequiredParameter(codeChallenge, "codeChallenge"),
    code_challenge_method: "S256",
  }).toString();

  return authorizeUrl.toString();
}

async function trocarCodePorToken({ code, codeVerifier }) {
  const config = getGovbrConfig();
  // Gov.br exige Basic (client_id:secret em base64) além do secret no corpo.
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

  return requestGovbr(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  }, 'token_exchange');
}

// Permissão admin é validada em outro serviço (adminAuthorization).
async function buscarUserInfo(accessToken) {
  const config = getGovbrConfig();
  const token = getRequiredParameter(accessToken, "accessToken");

  return requestGovbr(config.userInfoUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, 'userinfo');
}

module.exports = {
  buildAuthorizeUrl,
  trocarCodePorToken,
  buscarUserInfo,
};
