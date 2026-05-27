'use strict';

function getRequiredEnvironmentValue(name) {
  const value = String(process.env[name] || '').trim();

  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria nao configurada: ${name}.`);
  }

  return value;
}

function getRequiredParameter(value, name) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    throw new Error(`Parametro obrigatorio nao informado: ${name}.`);
  }

  return normalized;
}

async function parseJsonResponse(response, operation) {
  let data;

  try {
    data = await response.json();
  } catch (_error) {
    if (!response.ok) {
      throw new Error(`Falha do Gov.br ao ${operation} (HTTP ${response.status}).`);
    }

    throw new Error(`Resposta invalida do Gov.br ao ${operation}.`);
  }

  if (!response.ok) {
    const detail = data && typeof data === 'object'
      ? data.error_description || data.error || data.message
      : '';
    const suffix = detail ? `: ${detail}` : '';
    throw new Error(`Falha do Gov.br ao ${operation} (HTTP ${response.status})${suffix}`);
  }

  return data;
}

function buildAuthorizeUrl({ state, codeChallenge }) {
  const authorizeUrl = new URL(getRequiredEnvironmentValue('GOVBR_AUTHORIZE_URL'));
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: getRequiredEnvironmentValue('GOVBR_CLIENT_ID'),
    redirect_uri: getRequiredEnvironmentValue('GOVBR_REDIRECT_URI'),
    scope: 'openid email profile',
    state: getRequiredParameter(state, 'state'),
    code_challenge: getRequiredParameter(codeChallenge, 'codeChallenge'),
    code_challenge_method: 'S256'
  }).toString();

  return authorizeUrl.toString();
}

async function trocarCodePorToken({ code, codeVerifier }) {
  const clientId = getRequiredEnvironmentValue('GOVBR_CLIENT_ID');
  const clientSecret = getRequiredEnvironmentValue('GOVBR_CLIENT_SECRET');
  const tokenUrl = getRequiredEnvironmentValue('GOVBR_TOKEN_URL');
  const redirectUri = getRequiredEnvironmentValue('GOVBR_REDIRECT_URI');
  const credentials = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: getRequiredParameter(code, 'code'),
    redirect_uri: redirectUri,
    code_verifier: getRequiredParameter(codeVerifier, 'codeVerifier')
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  return parseJsonResponse(response, 'trocar o codigo por token');
}

async function buscarUserInfo(accessToken) {
  const token = getRequiredParameter(accessToken, 'accessToken');

  const response = await fetch(getRequiredEnvironmentValue('GOVBR_USERINFO_URL'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return parseJsonResponse(response, 'consultar userinfo');
}

module.exports = {
  buildAuthorizeUrl,
  trocarCodePorToken,
  buscarUserInfo
};
