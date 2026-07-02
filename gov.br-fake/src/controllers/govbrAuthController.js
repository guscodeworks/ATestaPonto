'use strict';

const { env } = require('../config/env');
const { AppError } = require('../utils/errors');
const { generateSecureToken, timingSafeStringEquals } = require('../utils/crypto');
const { registerAuthorizationCode, consumeAuthorizationCode } = require('../services/authCodeService');
const { registerAccessToken, findUserInfoByAccessToken } = require('../services/tokenService');
const { validateS256 } = require('../services/pkceService');
const fakeUserService = require('../services/fakeUserService');
const memoryStore = require('../repositories/memoryStore');

// Controller que simula um provedor de identidade nos moldes do govbr (Authorization Code +
// PKCE), usado apenas em ambientes de desenvolvimento/demonstração para testar o fluxo de
// login sem depender do provedor real.
const FAKE_SESSION_COOKIE = 'govbr_fake_session';
const POST_LOGIN_REDIRECT_PATH = '/visual.html';

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

// Faz o parse manual do header Cookie em busca do cookie informado.
// Atenção: quando o cookie não é encontrado, o retorno é "{}" (objeto vazio) em vez de
// undefined/string vazia. Como "{}" é truthy em JS, isso afeta os `if` que consomem o
// retorno desta função em outros pontos do arquivo (ver Sugestões de melhoria).
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

      return key === name ? decodeURIComponent(value) : {};
    }, {});
}

// Recupera as informações do usuário fake "admin", único perfil que de fato autentica
// nesta simulação (ver observação em `login`). O papel "admin" é fixo porque este
// provedor fake não implementa outros níveis de acesso.
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

// Cria uma sessão fake em memória (não persistida), sempre associada ao usuário admin
// configurado via env — independente de qual "sub" foi enviado no login (ver `login`).
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

function clearFakeSession(req, res) {
  const sessionId = getCookie(req, FAKE_SESSION_COOKIE);

  if (sessionId) {
    memoryStore.deleteFakeLoginSession(sessionId);
  }

  res.setHeader('Set-Cookie', buildCookie(FAKE_SESSION_COOKIE, '', {
    maxAge: 0
  }));
}

// Verifica se existe uma sessão fake válida associada ao cookie da requisição.
// Aproveita a chamada para limpar registros expirados da store em memória (housekeeping).
function getAuthenticatedUser(req) {
  memoryStore.cleanupExpiredRecords();

  const sessionId = getCookie(req, FAKE_SESSION_COOKIE);
  if (!sessionId) {
    // "Sem sessão": por conta do retorno de `getCookie`, este `{}` é truthy para quem
    // chama esta função (ex.: `if (!getAuthenticatedUser(req))` não detecta esse caso).
    return {};
  }

  const session = memoryStore.getFakeLoginSession(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    memoryStore.deleteFakeLoginSession(sessionId);
    // Mesma observação acima: este retorno "vazio" também é truthy para o chamador.
    return {};
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

    // Este provedor fake só suporta o fluxo "Authorization Code".
    if (responseType !== 'code') {
      throw requestError('response_type invalido.');
    }

    if (!timingSafeStringEquals(clientId, env.clientId)) {
      throw requestError('client_id invalido.', 401, 'INVALID_CLIENT');
    }

    if (!isAllowedRedirectUri(redirectUri)) {
      throw requestError('redirect_uri invalido.', 400, 'INVALID_REDIRECT_URI');
    }

    // PKCE é opcional, mas se o client enviar code_challenge, o método precisa ser S256.
    if (codeChallenge && codeChallengeMethod !== 'S256') {
      throw requestError('code_challenge_method invalido.');
    }

    // Deveria redirecionar para a tela de login quando não há sessão ativa — porém, ver
    // observação em `getAuthenticatedUser`/`getCookie` sobre o retorno "{}" ser truthy.
    if (!getAuthenticatedUser(req)) {
      return res.redirect('/govbr');
    }

    // Authorization code vinculado ao usuário admin fake (ver `createFakeSession`).
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
    const body = req.body || {};
    // O "sub" enviado é apenas validado (precisa existir entre os usuários fake),
    // mas a sessão criada logo abaixo sempre representa o usuário admin — `createFakeSession`
    // ignora o sub recebido. Ou seja, hoje só é possível autenticar como admin.
    const sub = String(body.sub || env.fakeAdminSub).trim();
    if (sub && !fakeUserService.findBySub(sub)) {
      throw requestError('Usuario fake nao encontrado.', 401, 'INVALID_FAKE_USER');
    }

    createFakeSession(res);
    return res.redirect(303, POST_LOGIN_REDIRECT_PATH);
  } catch (error) {
    return next(error);
  }
}

function showSession(req, res) {
  const user = getAuthenticatedUser(req);

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
}

function logout(req, res) {
  clearFakeSession(req, res);
  return res.redirect('/govbr');
}

function exchangeToken(req, res) {
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

// Extrai o token do header "Authorization: Bearer <token>".
// Mesmo padrão de `getCookie`: quando ausente/mal formado, retorna "{}" (objeto vazio)
// em vez de string vazia/undefined — ver Sugestões de melhoria.
function extractBearerToken(req) {
  const authorization = String(req.headers.authorization || '').trim();
  const [scheme, token] = authorization.split(' ');

  if (!/^Bearer$/i.test(scheme) || !token) {
    return {};
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

    // Endpoint estilo OIDC UserInfo. O papel "admin" é fixo pois este provedor fake
    // não modela outros perfis de acesso (mesma regra de `getFakeAdminUserInfo`).
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
  getAuthenticatedUser,
  logout,
  showSession,
  exchangeToken,
  showUserInfo
};