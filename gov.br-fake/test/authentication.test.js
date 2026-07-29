'use strict';

const assert = require('node:assert/strict');
const { after, before, beforeEach, test } = require('node:test');
const app = require('../src/app');
const { env } = require('../src/config/env');
const memoryStore = require('../src/repositories/memoryStore');
const { registerAccessToken } = require('../src/services/tokenService');
const { calculateS256 } = require('../src/services/pkceService');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  memoryStore.authCodes.clear();
  memoryStore.accessTokens.clear();
  memoryStore.pendingAuthorizeRequests.clear();
  memoryStore.fakeLoginSessions.clear();
});

function authorizeUrl(options = {}) {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: env.clientId,
    redirect_uri: env.pontoEscolarRedirectUri,
    state: 'test-state'
  });
  if (options.codeChallenge) {
    query.set('code_challenge', options.codeChallenge);
    query.set('code_challenge_method', 'S256');
  }
  return `${baseUrl}/fake-govbr/authorize?${query}`;
}

async function login(body) {
  const response = await fetch(`${baseUrl}/fake-govbr/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { response, cookie: response.headers.get('set-cookie') };
}

async function authorize(cookie, options = {}) {
  const response = await fetch(authorizeUrl(options), {
    redirect: 'manual',
    headers: { cookie }
  });
  const location = response.headers.get('location');
  return {
    response,
    code: location ? new URL(location).searchParams.get('code') : null
  };
}

async function exchangeCode(code, options = {}) {
  return fetch(`${baseUrl}/fake-govbr/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.pontoEscolarRedirectUri,
      code_verifier: options.codeVerifier || ''
    })
  });
}

async function issueToken(userSub) {
  const { cookie } = await login({ sub: userSub });
  const { code } = await authorize(cookie);
  const response = await exchangeCode(code);
  assert.equal(response.status, 200);
  return (await response.json()).access_token;
}

async function getUserInfo(accessToken) {
  return fetch(`${baseUrl}/fake-govbr/userinfo`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
}

test('home sem cookie exibe a pagina inicial', async () => {
  const response = await fetch(`${baseUrl}/`, { redirect: 'manual' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(await response.text(), /<!DOCTYPE html>/i);
});

test('area autenticada sem cookie redireciona para login', async () => {
  const response = await fetch(`${baseUrl}/visual.html`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/govbr');
});

test('sessao sem cookie informa authenticated false', async () => {
  const response = await fetch(`${baseUrl}/fake-govbr/session`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false, user: {} });
});

test('cookie inexistente ou invalido nao autentica', async () => {
  for (const cookie of ['outro=valor', 'govbr_fake_session=inexistente', 'govbr_fake_session=%E0%A4%A']) {
    const response = await fetch(`${baseUrl}/fake-govbr/session`, {
      headers: { cookie }
    });
    assert.equal((await response.json()).authenticated, false);
  }
});

test('sessao expirada nao autentica e e removida da store', async () => {
  const sessionId = 'expired-session';
  memoryStore.saveFakeLoginSession(sessionId, {
    userSub: env.fakeAdminSub,
    expiresAt: Date.now() - 1
  });

  const response = await fetch(`${baseUrl}/fake-govbr/session`, {
    headers: { cookie: `govbr_fake_session=${sessionId}` }
  });

  assert.equal((await response.json()).authenticated, false);
  assert.equal(memoryStore.fakeLoginSessions.has(sessionId), false);
});

test('sessao cujo usuario nao existe e removida da store', async () => {
  const sessionId = 'unknown-user-session';
  memoryStore.saveFakeLoginSession(sessionId, {
    userSub: 'usuario-inexistente',
    expiresAt: Date.now() + 60_000
  });

  const response = await fetch(`${baseUrl}/fake-govbr/session`, {
    headers: { cookie: `govbr_fake_session=${sessionId}` }
  });

  assert.equal((await response.json()).authenticated, false);
  assert.equal(memoryStore.fakeLoginSessions.has(sessionId), false);
});

test('userinfo sem Bearer token retorna 401', async () => {
  for (const authorization of [null, 'Basic abc', 'Bearer', 'Bearer token extra']) {
    const headers = authorization ? { authorization } : {};
    const response = await fetch(`${baseUrl}/fake-govbr/userinfo`, { headers });
    assert.equal(response.status, 401);
  }
});

test('authorize sem login redireciona e nao emite authorization code', async () => {
  const response = await fetch(authorizeUrl(), { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/govbr');
  assert.equal(memoryStore.authCodes.size, 0);
});

test('login sem usuario nao cria fallback de administrador', async () => {
  const { response } = await login({});

  assert.equal(response.status, 400);
  assert.equal(memoryStore.fakeLoginSessions.size, 0);
});

test('login aceita cpf formatado e vincula a sessao ao usuario correto', async () => {
  const { response, cookie } = await login({ cpf: '999.888.777-66' });

  assert.equal(response.status, 303);
  assert.ok(cookie);
  assert.equal(memoryStore.fakeLoginSessions.size, 1);
  assert.equal([...memoryStore.fakeLoginSessions.values()][0].userSub, '99988877766');

  const sessionResponse = await fetch(`${baseUrl}/fake-govbr/session`, {
    headers: { cookie }
  });
  const session = await sessionResponse.json();
  assert.equal(session.authenticated, true);
  assert.equal(session.user.sub, '99988877766');
});

test('login aceita sub e nao exige senha nesta etapa', async () => {
  const { response } = await login({ sub: '11122233344' });

  assert.equal(response.status, 303);
  assert.equal([...memoryStore.fakeLoginSessions.values()][0].userSub, '11122233344');
});

test('login rejeita usuario inexistente sem criar sessao', async () => {
  const { response } = await login({ cpf: '000.000.000-00' });

  assert.equal(response.status, 401);
  assert.equal(memoryStore.fakeLoginSessions.size, 0);
});

test('identidade e preservada da sessao ao code, token e userinfo', async () => {
  const expectedUser = {
    sub: '99988877766',
    name: 'Usuario Comum Demo',
    email: 'usuario.demo@govbr.fake'
  };
  const { cookie } = await login({ cpf: expectedUser.sub });
  const authorization = await authorize(cookie);

  assert.equal(authorization.response.status, 302);
  assert.ok(authorization.code);
  assert.equal(memoryStore.getAuthCode(authorization.code).userSub, expectedUser.sub);

  const tokenResponse = await exchangeCode(authorization.code);
  assert.equal(tokenResponse.status, 200);
  const token = await tokenResponse.json();
  assert.equal(memoryStore.getAccessToken(token.access_token).userSub, expectedUser.sub);

  const userInfoResponse = await fetch(`${baseUrl}/fake-govbr/userinfo`, {
    headers: { authorization: `Bearer ${token.access_token}` }
  });
  assert.equal(userInfoResponse.status, 200);
  const userInfo = await userInfoResponse.json();
  assert.deepEqual(userInfo, expectedUser);
  for (const authorizationField of ['role', 'isAdmin', 'permissions']) {
    assert.equal(Object.hasOwn(userInfo, authorizationField), false);
  }
});

test('token do usuario A retorna somente a identidade do usuario A', async () => {
  const accessToken = await issueToken('11122233344');
  const response = await getUserInfo(accessToken);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    sub: '11122233344',
    name: 'Servidor Admin Demo',
    email: 'admin.demo@govbr.fake'
  });
});

test('tokens dos usuarios A e B nao cruzam identidades', async () => {
  const tokenA = await issueToken('11122233344');
  const tokenB = await issueToken('99988877766');

  assert.notEqual(tokenA, tokenB);

  const [responseA, responseB] = await Promise.all([
    getUserInfo(tokenA),
    getUserInfo(tokenB)
  ]);

  assert.equal(responseA.status, 200);
  assert.equal(responseB.status, 200);
  assert.equal((await responseA.json()).sub, '11122233344');
  assert.equal((await responseB.json()).sub, '99988877766');
});

test('token invalido e rejeitado pelo userinfo', async () => {
  const response = await getUserInfo('token-inexistente');

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
});

test('token expirado e rejeitado e removido da store', async () => {
  const { accessToken } = registerAccessToken({
    userSub: '11122233344',
    ttlMs: -1
  });

  const response = await getUserInfo(accessToken);

  assert.equal(response.status, 401);
  assert.equal(memoryStore.accessTokens.has(accessToken), false);
});

test('PKCE invalido rejeita a troca e nao emite access token', async () => {
  const validVerifier = 'a'.repeat(43);
  const invalidVerifier = 'b'.repeat(43);
  const { cookie } = await login({ sub: '11122233344' });
  const { code } = await authorize(cookie, {
    codeChallenge: calculateS256(validVerifier)
  });

  const response = await exchangeCode(code, {
    codeVerifier: invalidVerifier
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'invalid_grant');
  assert.equal(memoryStore.accessTokens.size, 0);
});

test('authorization code e de uso unico', async () => {
  const { cookie } = await login({ sub: '11122233344' });
  const { code } = await authorize(cookie);

  const firstExchange = await exchangeCode(code);
  assert.equal(firstExchange.status, 200);

  const secondExchange = await exchangeCode(code);
  assert.equal(secondExchange.status, 400);
  assert.equal((await secondExchange.json()).error, 'invalid_grant');
});
