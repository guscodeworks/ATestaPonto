'use strict';

const { env } = require('../config/env');
const { AppError } = require('../utils/errors');
const { generateSecureToken, timingSafeStringEquals } = require('../utils/crypto');
const { registerAuthorizationCode, consumeAuthorizationCode } = require('../services/authCodeService');
const { registerAccessToken, findUserInfoByAccessToken } = require('../services/tokenService');
const { validateS256 } = require('../services/pkceService');
const fakeUserService = require('../services/fakeUserService');
const memoryStore = require('../repositories/memoryStore');
const {
  createFakeSessionStore
} = require('../repositories/fakeSessionStoreFactory');

// Controller que simula um provedor de identidade nos moldes do govbr (Authorization Code +
// PKCE), usado apenas em ambientes de desenvolvimento/demonstração para testar o fluxo de
// login sem depender do provedor real.
const FAKE_SESSION_COOKIE = 'govbr_fake_session';
const PENDING_AUTHORIZE_COOKIE = 'govbr_fake_authorize';
const POST_LOGIN_REDIRECT_PATH = '/visual.html';
const RESUME_AUTHORIZE_PATH = '/fake-govbr/authorize';
const LOGIN_FIELDS = new Set(['login', 'password']);
const fakeSessionStore = createFakeSessionStore();

function requestError(message, statusCode = 400, code = 'INVALID_REQUEST') {
  return new AppError(message, statusCode, code);
}

function getRequiredString(value, name) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    throw requestError(`${name} e obrigatorio.`);
  }

  return normalized;
}

// Comparação em tempo constante para evitar ataques de timing na validação do redirect_uri.
// Hoje só existe um redirect_uri permitido (integração com o Ponto Escolar).
function isAllowedRedirectUri(redirectUri) {
  return timingSafeStringEquals(redirectUri, env.pontoEscolarRedirectUri);
}

// Autenticação do client OAuth2 (client_id/client_secret) via comparação em tempo
// constante, para mitigar ataques de timing.
function validateClient(clientId, clientSecret) {
  return (
    timingSafeStringEquals(clientId, env.clientId) &&
    timingSafeStringEquals(clientSecret, env.clientSecret)
  );
}

// Extrai client_id/client_secret do header "Authorization: Basic base64(id:secret)",
// conforme previsto pela RFC 6749 para autenticação de clients no token endpoint.
function getBasicCredentials(req) {
  const authorization = String(req.headers.authorization || '').trim();

  if (!authorization.toLowerCase().startsWith('basic ')) {
    return {};
  }

  try {
    const decoded = Buffer
      .from(authorization.slice(6).trim(), 'base64')
      .toString('utf8');
    const separatorIndex = decoded.indexOf(':');

    if (separatorIndex < 0) {
      return {};
    }

    return {
      clientId: decoded.slice(0, separatorIndex),
      clientSecret: decoded.slice(separatorIndex + 1)
    };
  } catch (_error) {
    return {};
  }
}

// Formata a resposta de erro seguindo o padrão OAuth2 (error / error_description).
function sendOAuthError(res, error, statusCode = 400) {
  return res.status(statusCode).json({
    error: error.code || 'invalid_request',
    error_description: String(error.message || 'Requisicao invalida.')
  });
}

// Monta o header Set-Cookie manualmente (sem lib externa).
// O atributo "Secure" só é adicionado em produção, para permitir testes locais via HTTP.
function buildCookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];

  if (Number.isInteger(options.maxAge)) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (env.nodeEnv === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function getCookie(req, name) {
  const cookieHeader = req && req.headers && typeof req.headers.cookie === 'string'
    ? req.headers.cookie
    : '';

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const encodedValue = part.slice(separatorIndex + 1).trim();
    if (key !== name || !encodedValue) {
      continue;
    }

    try {
      const value = decodeURIComponent(encodedValue).trim();
      return value || null;
    } catch (_error) {
      return null;
    }
  }

  return null;
}

function readAuthorizeRequest(query = {}) {
  return {
    responseType: getRequiredString(query.response_type, 'response_type'),
    clientId: getRequiredString(query.client_id, 'client_id'),
    redirectUri: getRequiredString(query.redirect_uri, 'redirect_uri'),
    state: String(query.state || '').trim(),
    codeChallenge: String(query.code_challenge || '').trim(),
    codeChallengeMethod: String(query.code_challenge_method || '').trim()
  };
}

function validateAuthorizeRequest(authorizeRequest) {
  if (authorizeRequest.responseType !== 'code') {
    throw requestError('response_type invalido.');
  }

  if (!timingSafeStringEquals(authorizeRequest.clientId, env.clientId)) {
    throw requestError('client_id invalido.', 401, 'INVALID_CLIENT');
  }

  if (!isAllowedRedirectUri(authorizeRequest.redirectUri)) {
    throw requestError('redirect_uri invalido.', 400, 'INVALID_REDIRECT_URI');
  }

  if (
    authorizeRequest.codeChallenge &&
    authorizeRequest.codeChallengeMethod !== 'S256'
  ) {
    throw requestError('code_challenge_method invalido.');
  }

  return authorizeRequest;
}

function savePendingAuthorizeRequest(res, authorizeRequest) {
  memoryStore.cleanupExpiredRecords();
  const requestId = generateSecureToken('authorize_request');

  memoryStore.savePendingAuthorizeRequest(requestId, {
    ...authorizeRequest,
    expiresAt: Date.now() + env.pendingAuthorizeRequestTtlMs
  });
  res.setHeader('Set-Cookie', buildCookie(PENDING_AUTHORIZE_COOKIE, requestId, {
    maxAge: Math.floor(env.pendingAuthorizeRequestTtlMs / 1000)
  }));
}

function getPendingAuthorizeRequest(req) {
  memoryStore.cleanupExpiredRecords();
  const requestId = getCookie(req, PENDING_AUTHORIZE_COOKIE);
  return requestId ? memoryStore.getPendingAuthorizeRequest(requestId) : null;
}

function clearPendingAuthorizeRequest(req, res) {
  const requestId = getCookie(req, PENDING_AUTHORIZE_COOKIE);
  if (requestId) {
    memoryStore.deletePendingAuthorizeRequest(requestId);
  }
  res.setHeader('Set-Cookie', buildCookie(PENDING_AUTHORIZE_COOKIE, '', {
    maxAge: 0
  }));
}

// Cria uma sessão fake no repositório configurado e só então envia o cookie.
async function createFakeSession(res, userSub) {
  const sessionId = generateSecureToken('fake_session');
  await fakeSessionStore.saveSession(sessionId, { userSub });

  res.setHeader('Set-Cookie', buildCookie(FAKE_SESSION_COOKIE, sessionId, {
    maxAge: Math.floor(env.fakeSessionTtlMs / 1000)
  }));
}

async function clearFakeSession(req, res) {
  const sessionId = getCookie(req, FAKE_SESSION_COOKIE);

  if (sessionId) {
    await fakeSessionStore.deleteSession(sessionId);
  }

  res.setHeader('Set-Cookie', buildCookie(FAKE_SESSION_COOKIE, '', {
    maxAge: 0
  }));
}

// Verifica se existe uma sessão fake válida associada ao cookie da requisição.
// Mantém o housekeeping dos demais Maps em memória, ainda usados pelo OAuth fake.
async function getAuthenticatedUser(req) {
  memoryStore.cleanupExpiredRecords();

  const sessionId = getCookie(req, FAKE_SESSION_COOKIE);
  if (!sessionId) {
    return null;
  }

  const session = await fakeSessionStore.getSession(sessionId);
  const expiresAt = Number(session && session.expiresAt);
  if (!session || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await fakeSessionStore.deleteSession(sessionId);
    return null;
  }

  const userInfo = fakeUserService.toUserInfo(fakeUserService.findBySub(session.userSub));

  if (!userInfo) {
    await fakeSessionStore.deleteSession(sessionId);
    return null;
  }

  return userInfo;
}

async function showAuthorize(req, res, next) {
  try {
    const hasAuthorizeQuery = Object.hasOwn(req.query, 'response_type');
    const pendingAuthorizeRequest = hasAuthorizeQuery
      ? null
      : getPendingAuthorizeRequest(req);
    const authorizeRequest = validateAuthorizeRequest(
      hasAuthorizeQuery
        ? readAuthorizeRequest(req.query)
        : pendingAuthorizeRequest || {}
    );

    const authenticatedUser = await getAuthenticatedUser(req);
    if (!authenticatedUser) {
      if (hasAuthorizeQuery) {
        savePendingAuthorizeRequest(res, authorizeRequest);
      }
      return res.redirect('/govbr');
    }

    if (pendingAuthorizeRequest) {
      clearPendingAuthorizeRequest(req, res);
    }

    const { code } = await registerAuthorizationCode({
      codeChallenge: authorizeRequest.codeChallenge,
      codeChallengeMethod: authorizeRequest.codeChallengeMethod,
      redirectUri: authorizeRequest.redirectUri,
      clientId: authorizeRequest.clientId,
      userSub: authenticatedUser.sub
    });

    const callbackUrl = new URL(authorizeRequest.redirectUri);
    callbackUrl.searchParams.set('code', code);
    if (authorizeRequest.state) {
      callbackUrl.searchParams.set('state', authorizeRequest.state);
    }

    return res.redirect(callbackUrl.toString());
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const body = req.body || {};
    const receivedFields = Object.keys(body);

    if (receivedFields.some((field) => !LOGIN_FIELDS.has(field))) {
      throw requestError('Payload de login invalido.', 400, 'INVALID_LOGIN_PAYLOAD');
    }

    const loginValue = String(body.login || '').trim();
    const password = String(body.password || '');
    const credentialsAreWithinLimits =
      loginValue.length > 0 && loginValue.length <= 64 &&
      password.length > 0 && password.length <= 256;
    const user = credentialsAreWithinLimits
      ? fakeUserService.authenticate({ login: loginValue, password })
      : null;

    if (!user) {
      throw requestError(
        'Credenciais demonstrativas invalidas.',
        401,
        'INVALID_DEMO_CREDENTIALS'
      );
    }

    await createFakeSession(res, user.sub);
    return res.status(200).json({
      success: true,
      redirectTo: getPendingAuthorizeRequest(req)
        ? RESUME_AUTHORIZE_PATH
        : POST_LOGIN_REDIRECT_PATH
    });
  } catch (error) {
    return next(error);
  }
}

async function showSession(req, res, next) {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(200).json({
        authenticated: false,
        user: {}
      });
    }

    return res.status(200).json({
      authenticated: true,
      user
    });
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    await clearFakeSession(req, res);
    return res.redirect('/govbr');
  } catch (error) {
    return next(error);
  }
}

async function exchangeToken(req, res, next) {
  try {
    // Credenciais do client podem vir no body ou via HTTP Basic Auth (RFC 6749).
    const basicCredentials = getBasicCredentials(req);
    const code = getRequiredString(req.body.code, 'code');
    const clientId = String(req.body.client_id || basicCredentials.clientId || '').trim();
    const clientSecret = String(req.body.client_secret || basicCredentials.clientSecret || '').trim();
    const redirectUri = getRequiredString(req.body.redirect_uri, 'redirect_uri');
    const codeVerifier = String(req.body.code_verifier || '').trim();

    if (!validateClient(clientId, clientSecret)) {
      return sendOAuthError(
        res,
        requestError('Credenciais do cliente invalidas.', 401, 'invalid_client'),
        401
      );
    }

    if (!isAllowedRedirectUri(redirectUri)) {
      return sendOAuthError(
        res,
        requestError('redirect_uri invalido.', 400, 'invalid_grant')
      );
    }

    // O authorization code é de uso único: `consumeAuthorizationCode` deve invalidá-lo
    // ao ser lido, prevenindo reuso (replay).
    let authCode;
    try {
      authCode = await consumeAuthorizationCode(code);
    } catch (error) {
      // Falhas do repositório são erros de infraestrutura e não significam
      // authorization code inválido. O handler central responde sem vazar detalhes.
      return next(error);
    }

    if (
      !authCode ||
      !timingSafeStringEquals(authCode.clientId, clientId) ||
      !timingSafeStringEquals(authCode.redirectUri, redirectUri)
    ) {
      return sendOAuthError(
        res,
        requestError('Authorization code invalido ou expirado.', 400, 'invalid_grant')
      );
    }

    // Se o authorize foi iniciado com PKCE (code_challenge), o token endpoint precisa
    // validar o code_verifier correspondente antes de emitir o token.
    if (authCode.codeChallenge && !validateS256({
      codeVerifier,
      codeChallenge: authCode.codeChallenge
    })) {
      return sendOAuthError(
        res,
        requestError('PKCE code_verifier invalido.', 400, 'invalid_grant')
      );
    }

    let token;
    try {
      token = await registerAccessToken({
        userSub: authCode.userSub
      });
    } catch (error) {
      return next(error);
    }

    return res.status(200).json({
      access_token: token.accessToken,
      token_type: token.tokenType,
      expires_in: token.expiresIn
    });
  } catch (error) {
    return sendOAuthError(res, error, error.statusCode || 400);
  }
}

function extractBearerToken(req) {
  const authorization = req && req.headers && typeof req.headers.authorization === 'string'
    ? req.headers.authorization.trim()
    : '';
  const match = authorization.match(/^Bearer[ \t]+([^\s]+)$/i);

  if (!match) {
    return null;
  }

  return match[1];
}

async function showUserInfo(req, res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      throw requestError('Bearer token obrigatorio.', 401, 'UNAUTHORIZED');
    }

    let userInfo;
    try {
      userInfo = await findUserInfoByAccessToken(token);
    } catch (error) {
      return next(error);
    }

    if (!userInfo) {
      throw requestError('Token invalido ou expirado.', 401, 'UNAUTHORIZED');
    }

    // Endpoint estilo OIDC UserInfo: retorna somente a identidade vinculada ao token.
    // A autorização administrativa pertence ao Ponto Escolar.
    return res.status(200).json(userInfo);
  } catch (error) {
    return res.status(error.statusCode || 401).json({
      success: false,
      error: {
        code: error.code || 'UNAUTHORIZED',
        message: String(error.message || 'Token invalido.')
      }
    });
  }
}

module.exports = {
  showAuthorize,
  login,
  getCookie,
  getAuthenticatedUser,
  extractBearerToken,
  logout,
  showSession,
  exchangeToken,
  showUserInfo
};
