'use strict';

const { env } = require('../config/env');
const { AppError } = require('../utils/errors');
const { generateSecureToken, timingSafeStringEquals } = require('../utils/crypto');
const { registerAuthorizationCode, consumeAuthorizationCode } = require('../services/authCodeService');
const { registerAccessToken, findUserInfoByAccessToken } = require('../services/tokenService');
const { validateS256 } = require('../services/pkceService');
const fakeUserService = require('../services/fakeUserService');
const memoryStore = require('../repositories/memoryStore');

const FAKE_SESSION_COOKIE = 'govbr_fake_session';

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

function isAllowedRedirectUri(redirectUri) {
  return timingSafeStringEquals(redirectUri, env.pontoEscolarRedirectUri);
}

function validateClient(clientId, clientSecret) {
  return (
    timingSafeStringEquals(clientId, env.clientId) &&
    timingSafeStringEquals(clientSecret, env.clientSecret)
  );
}

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

function sendOAuthError(res, error, statusCode = 400) {
  return res.status(statusCode).json({
    error: error.code || 'invalid_request',
    error_description: String(error.message || 'Requisicao invalida.')
  });
}

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
  return String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((found, part) => {
      if (found) {
        return found;
      }

      const separatorIndex = part.indexOf('=');
      const key = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
      const value = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : '';

      return key === name ? decodeURIComponent(value) : null;
    }, null);
}

function getFakeAdminUserInfo() {
  const user = fakeUserService.findBySub(env.fakeAdminSub);
  const userInfo = fakeUserService.toUserInfo(user);

  if (!userInfo) {
    throw requestError('Usuario fake nao configurado.', 500, 'FAKE_USER_NOT_CONFIGURED');
  }

  return {
    ...userInfo,
    role: 'admin'
  };
}

function createFakeSession(res) {
  const sessionId = generateSecureToken('fake_session');
  memoryStore.saveFakeLoginSession(sessionId, {
    userSub: env.fakeAdminSub,
    expiresAt: Date.now() + env.fakeSessionTtlMs
  });

  res.setHeader('Set-Cookie', buildCookie(FAKE_SESSION_COOKIE, sessionId, {
    maxAge: Math.floor(env.fakeSessionTtlMs / 1000)
  }));
}

function getAuthenticatedUser(req) {
  memoryStore.cleanupExpiredRecords();

  const sessionId = getCookie(req, FAKE_SESSION_COOKIE);
  if (!sessionId) {
    return null;
  }

  const session = memoryStore.getFakeLoginSession(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    memoryStore.deleteFakeLoginSession(sessionId);
    return null;
  }

  return getFakeAdminUserInfo();
}

function showAuthorize(req, res, next) {
  try {
    const responseType = getRequiredString(req.query.response_type, 'response_type');
    const clientId = getRequiredString(req.query.client_id, 'client_id');
    const redirectUri = getRequiredString(req.query.redirect_uri, 'redirect_uri');
    const state = String(req.query.state || '').trim();
    const codeChallenge = String(req.query.code_challenge || '').trim();
    const codeChallengeMethod = String(req.query.code_challenge_method || '').trim();

    if (responseType !== 'code') {
      throw requestError('response_type invalido.');
    }

    if (!timingSafeStringEquals(clientId, env.clientId)) {
      throw requestError('client_id invalido.', 401, 'INVALID_CLIENT');
    }

    if (!isAllowedRedirectUri(redirectUri)) {
      throw requestError('redirect_uri invalido.', 400, 'INVALID_REDIRECT_URI');
    }

    if (codeChallenge && codeChallengeMethod !== 'S256') {
      throw requestError('code_challenge_method invalido.');
    }

    if (!getAuthenticatedUser(req)) {
      return res.redirect('/govbr');
    }

    const { code } = registerAuthorizationCode({
      codeChallenge,
      codeChallengeMethod,
      redirectUri,
      clientId,
      userSub: env.fakeAdminSub
    });

    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }

    return res.redirect(callbackUrl.toString());
  } catch (error) {
    return next(error);
  }
}

function login(req, res, next) {
  try {
    const sub = String(req.body.sub || env.fakeAdminSub).trim();
    if (sub && !fakeUserService.findBySub(sub)) {
      throw requestError('Usuario fake nao encontrado.', 401, 'INVALID_FAKE_USER');
    }

    createFakeSession(res);

    if (req.accepts(['html', 'json']) === 'html') {
      return res.redirect('/');
    }

    return res.status(200).json({
      success: true,
      authenticated: true,
      user: getFakeAdminUserInfo()
    });
  } catch (error) {
    return next(error);
  }
}

function showSession(req, res) {
  const user = getAuthenticatedUser(req);

  if (!user) {
    return res.status(200).json({
      authenticated: false,
      user: null
    });
  }

  return res.status(200).json({
    authenticated: true,
    user
  });
}

function exchangeToken(req, res) {
  try {
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

    const authCode = consumeAuthorizationCode(code);

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

    if (authCode.codeChallenge && !validateS256({
      codeVerifier,
      codeChallenge: authCode.codeChallenge
    })) {
      return sendOAuthError(
        res,
        requestError('PKCE code_verifier invalido.', 400, 'invalid_grant')
      );
    }

    const token = registerAccessToken({
      userSub: authCode.userSub
    });

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
  const authorization = String(req.headers.authorization || '').trim();
  const [scheme, token] = authorization.split(' ');

  if (!/^Bearer$/i.test(scheme) || !token) {
    return null;
  }

  return token.trim();
}

function showUserInfo(req, res) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      throw requestError('Bearer token obrigatorio.', 401, 'UNAUTHORIZED');
    }

    const userInfo = findUserInfoByAccessToken(token);

    if (!userInfo) {
      throw requestError('Token invalido ou expirado.', 401, 'UNAUTHORIZED');
    }

    return res.status(200).json({
      ...userInfo,
      role: 'admin'
    });
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
  showSession,
  exchangeToken,
  showUserInfo
};
