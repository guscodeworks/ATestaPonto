"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { getGovbrConfig } = require("../src/config/govbr");
const {
  verificarSeUsuarioGovbrEhAdmin,
} = require("../src/services/adminAuthorization.service");
const {
  concluirLoginGovbr,
} = require("../src/controllers/govbrAuth.controller");

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function createSession(oauthGovbr) {
  return {
    oauthGovbr,
    save(callback) {
      callback();
    },
    regenerate(callback) {
      delete this.oauthGovbr;
      callback();
    },
  };
}

function createCallbackRequest(userInfo) {
  const state = "state-seguro";
  const req = {
    query: { code: "authorization-code", state },
    session: createSession({ state, codeVerifier: "code-verifier" }),
  };
  const redirects = [];
  const res = {
    redirect(location) {
      redirects.push(location);
      return location;
    },
  };
  const errors = [];
  const next = (error) => {
    errors.push(error);
  };

  global.fetch = async (url) => {
    if (url === getGovbrConfig().tokenUrl) {
      return new Response(JSON.stringify({ access_token: "access-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url === getGovbrConfig().userInfoUrl) {
      return new Response(JSON.stringify(userInfo), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`URL inesperada no teste: ${url}`);
  };

  return { req, res, next, redirects, errors };
}

function getAuthorizedIdentity() {
  const { adminSubs, adminEmails } = getGovbrConfig();

  if (adminSubs.length > 0) {
    return {
      sub: adminSubs[0],
      name: "Administrador autorizado",
      email: "identidade@exemplo.invalid",
    };
  }

  return {
    sub: "sub-autenticado",
    name: "Administrador autorizado",
    email: adminEmails[0].toUpperCase(),
  };
}

test("allowlist usa somente sub ou email normalizado", () => {
  const { adminEmails } = getGovbrConfig();
  const unauthorizedProviderClaims = {
    sub: "sub-nao-autorizado",
    email: "nao-autorizado@exemplo.invalid",
    role: "admin",
    isAdmin: true,
    permissions: ["admin"],
  };

  assert.equal(
    verificarSeUsuarioGovbrEhAdmin(unauthorizedProviderClaims),
    false
  );

  if (adminEmails.length > 0) {
    assert.equal(
      verificarSeUsuarioGovbrEhAdmin({
        sub: "outro-sub",
        email: `  ${adminEmails[0].toUpperCase()}  `,
        role: "user",
        isAdmin: false,
        permissions: [],
      }),
      true
    );
  }
});

test("callback nega com 403 sem criar sessao admin ou redirecionar", async () => {
  const context = createCallbackRequest({
    sub: "sub-nao-autorizado",
    name: "Usuario sem permissao",
    email: "nao-autorizado@exemplo.invalid",
    role: "admin",
    isAdmin: true,
    permissions: ["admin"],
  });

  await concluirLoginGovbr(context.req, context.res, context.next);

  assert.equal(context.errors.length, 1);
  assert.equal(context.errors[0].statusCode, 403);
  assert.equal(context.errors[0].code, "FORBIDDEN");
  assert.equal(context.req.session.admin, undefined);
  assert.deepEqual(context.redirects, []);
});

test("callback autorizado regenera sessao e cria admin Gov.br", async () => {
  const userInfo = {
    ...getAuthorizedIdentity(),
    role: "qualquer-valor",
    isAdmin: false,
    permissions: ["campo-do-provedor-ignorado"],
  };
  const context = createCallbackRequest(userInfo);
  let regenerated = false;
  const originalRegenerate = context.req.session.regenerate;
  context.req.session.regenerate = function regenerate(callback) {
    regenerated = true;
    originalRegenerate.call(this, callback);
  };

  await concluirLoginGovbr(context.req, context.res, context.next);

  assert.deepEqual(context.errors, []);
  assert.equal(regenerated, true);
  assert.equal(context.req.session.admin.authProvider, "govbr");
  assert.equal(context.req.session.admin.sub, userInfo.sub.trim());
  assert.equal(context.req.session.admin.name, userInfo.name);
  assert.equal(context.req.session.admin.email, userInfo.email.trim());
  assert.equal(Object.hasOwn(context.req.session.admin, "role"), false);
  assert.equal(Object.hasOwn(context.req.session.admin, "isAdmin"), false);
  assert.equal(Object.hasOwn(context.req.session.admin, "permissions"), false);
  assert.deepEqual(context.redirects, ["/admin/dashboard"]);
});

test("callback sem state e rejeitado e limpa dados OAuth", async () => {
  const context = createCallbackRequest(getAuthorizedIdentity());
  delete context.req.query.state;

  await concluirLoginGovbr(context.req, context.res, context.next);

  assert.equal(context.errors.length, 1);
  assert.equal(context.errors[0].statusCode, 400);
  assert.equal(context.errors[0].code, "BAD_REQUEST");
  assert.equal(context.req.session.oauthGovbr, undefined);
  assert.equal(context.req.session.admin, undefined);
  assert.deepEqual(context.redirects, []);
});

test("callback com state incorreto e rejeitado", async () => {
  const context = createCallbackRequest(getAuthorizedIdentity());
  context.req.query.state = "state-incorreto";

  await concluirLoginGovbr(context.req, context.res, context.next);

  assert.equal(context.errors.length, 1);
  assert.equal(context.errors[0].statusCode, 401);
  assert.equal(context.errors[0].code, "UNAUTHORIZED");
  assert.equal(context.req.session.oauthGovbr, undefined);
  assert.equal(context.req.session.admin, undefined);
  assert.deepEqual(context.redirects, []);
});

test("callback rejeita access_token recebido pela URL", async () => {
  const context = createCallbackRequest(getAuthorizedIdentity());
  context.req.query.access_token = "token-injetado";

  await concluirLoginGovbr(context.req, context.res, context.next);

  assert.equal(context.errors.length, 1);
  assert.equal(context.errors[0].statusCode, 400);
  assert.equal(context.errors[0].code, "BAD_REQUEST");
  assert.equal(context.req.session.oauthGovbr, undefined);
  assert.equal(context.req.session.admin, undefined);
  assert.deepEqual(context.redirects, []);
});
