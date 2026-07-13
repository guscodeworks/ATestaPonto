"use strict";

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const app = require("../src/app");
const env = require("../src/config/env");
const ensureAdminAuthenticated = require("../src/middlewares/ensureAdminAuthenticated");
const { sairGovbr } = require("../src/controllers/govbrAuth.controller");

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!server || !server.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("cookie de sessao usa atributos seguros e expiracao explicita", async () => {
  const beforeRequest = Date.now();
  const response = await fetch(`${baseUrl}/auth/govbr/login`, {
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie");

  assert.equal(response.status, 302);
  assert.ok(setCookie);
  assert.match(setCookie, /connect\.sid=/i);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);

  const expiresMatch = setCookie.match(/Expires=([^;]+)/i);
  assert.ok(expiresMatch, "cookie deve ter expiracao explicita");
  const expiresAt = Date.parse(expiresMatch[1]);
  assert.ok(Number.isFinite(expiresAt));
  assert.ok(expiresAt >= beforeRequest + env.ADMIN_SESSION_TTL_MS - 2_000);
  assert.equal(/;\s*Secure/i.test(setCookie), env.IS_PRODUCTION);
});

test("logout remove dados, destroi sessao, limpa cookie e exige novo login", async () => {
  let destroyed = false;
  const session = {
    admin: {
      authProvider: "govbr",
      sub: "admin-anterior",
      email: "admin-anterior@exemplo.invalid",
    },
    oauthGovbr: {
      state: "state-anterior",
      codeVerifier: "verifier-anterior",
    },
    destroy(callback) {
      destroyed = true;
      callback();
    },
  };
  const req = { session };
  const clearedCookies = [];
  const headers = {};
  const redirects = [];
  const errors = [];
  const res = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    clearCookie(name, options) {
      clearedCookies.push({ name, options });
    },
    redirect(location) {
      redirects.push(location);
      return location;
    },
  };

  await sairGovbr(req, res, (error) => errors.push(error));

  assert.deepEqual(errors, []);
  assert.equal(session.admin, undefined);
  assert.equal(session.oauthGovbr, undefined);
  assert.equal(destroyed, true);
  assert.match(headers["set-cookie"], /admin_token=;/);
  assert.deepEqual(clearedCookies, [
    {
      name: "connect.sid",
      options: {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: env.IS_PRODUCTION,
      },
    },
  ]);
  assert.deepEqual(redirects, [
    `${env.GOVBR_FAKE_BASE_URL}/fake-govbr/logout`,
  ]);

  const dashboardRedirects = [];
  let dashboardAllowed = false;
  ensureAdminAuthenticated(
    req,
    {
      redirect(location) {
        dashboardRedirects.push(location);
      },
    },
    () => {
      dashboardAllowed = true;
    }
  );

  assert.equal(dashboardAllowed, false);
  assert.deepEqual(dashboardRedirects, ["/auth/govbr/login"]);
});
