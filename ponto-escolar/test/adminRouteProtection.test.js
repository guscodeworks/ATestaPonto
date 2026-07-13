"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const ensureAdminAuthenticated = require("../src/middlewares/ensureAdminAuthenticated");
const ensureAdminApiAuthenticated = require("../src/middlewares/ensureAdminApiAuthenticated");
const { createAdminPagesRouter } = require("../src/routes/pages/admin.routes");
const apiRouter = require("../src/routes");
const { getGovbrConfig } = require("../src/config/govbr");

function createRedirectResponse() {
  const redirects = [];
  return {
    redirects,
    res: {
      redirect(location) {
        redirects.push(location);
        return location;
      },
    },
  };
}

function getAuthorizedAdmin() {
  const { adminSubs, adminEmails } = getGovbrConfig();
  return {
    authProvider: "govbr",
    sub: adminSubs[0] || "",
    email: adminEmails[0] || "",
    name: "Administrador autorizado",
  };
}

test("pagina admin sem sessao redireciona para login", () => {
  const { res, redirects } = createRedirectResponse();
  let nextCalled = false;

  ensureAdminAuthenticated(
    { headers: { cookie: "connect.sid=cookie-isolado" } },
    res,
    () => {
      nextCalled = true;
    }
  );

  assert.deepEqual(redirects, ["/auth/govbr/login"]);
  assert.equal(nextCalled, false);
});

test("pagina admin bloqueia sessao existente sem admin", () => {
  const { res, redirects } = createRedirectResponse();
  let nextCalled = false;

  ensureAdminAuthenticated({ session: {} }, res, () => {
    nextCalled = true;
  });

  assert.deepEqual(redirects, ["/auth/govbr/login"]);
  assert.equal(nextCalled, false);
});

test("usuario presente na allowlist pode acessar o dashboard", () => {
  const req = { session: { admin: getAuthorizedAdmin() } };
  const { res, redirects } = createRedirectResponse();
  let nextCalled = false;

  ensureAdminAuthenticated(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(redirects, []);
  assert.equal(req.user, req.session.admin);
});

test("pagina bloqueia sessao cuja identidade saiu da allowlist", () => {
  const { res, redirects } = createRedirectResponse();
  let nextCalled = false;
  const req = {
    session: {
      admin: {
        authProvider: "govbr",
        sub: "sub-revogado",
        email: "revogado@exemplo.invalid",
      },
    },
  };

  ensureAdminAuthenticated(req, res, () => {
    nextCalled = true;
  });

  assert.deepEqual(redirects, ["/auth/govbr/login"]);
  assert.equal(nextCalled, false);
});

test("API sem sessao retorna erro 401 mesmo com cookie isolado", () => {
  const errors = [];

  ensureAdminApiAuthenticated(
    { headers: { cookie: "connect.sid=cookie-isolado" } },
    {},
    (error) => errors.push(error)
  );

  assert.equal(errors.length, 1);
  assert.equal(errors[0].statusCode, 401);
  assert.equal(errors[0].code, "UNAUTHORIZED");
});

test("API retorna 403 quando identidade foi removida da allowlist", () => {
  const errors = [];
  const req = {
    session: {
      admin: {
        authProvider: "govbr",
        sub: "sub-revogado",
        email: "revogado@exemplo.invalid",
      },
    },
  };

  ensureAdminApiAuthenticated(req, {}, (error) => errors.push(error));

  assert.equal(errors.length, 1);
  assert.equal(errors[0].statusCode, 403);
  assert.equal(errors[0].code, "FORBIDDEN");
  assert.equal(req.auth, undefined);
});

test("API reavalia allowlist e aceita sessao Gov.br ainda autorizada", () => {
  const req = { session: { admin: getAuthorizedAdmin() } };
  const calls = [];

  ensureAdminApiAuthenticated(req, {}, (error) => calls.push(error));

  assert.deepEqual(calls, [undefined]);
  assert.equal(req.user, req.session.admin);
  assert.equal(req.auth.authProvider, "govbr");
  assert.equal(
    req.auth.id,
    req.session.admin.sub || req.session.admin.email.toLowerCase()
  );
});

test("todas as paginas administrativas protegidas usam o middleware", () => {
  const router = createAdminPagesRouter({ sendView() {} });
  const publicAuthPages = new Set(["/admin/login", "/admin/logout"]);

  for (const layer of router.stack) {
    if (!layer.route || publicAuthPages.has(layer.route.path)) {
      continue;
    }

    assert.ok(
      layer.route.stack.some(
        (routeLayer) => routeLayer.handle === ensureAdminAuthenticated
      ),
      `${layer.route.path} deve usar ensureAdminAuthenticated`
    );
  }
});

test("todos os grupos de APIs administrativas usam o middleware", () => {
  const adminPrefixes = [
    "/admin/auth",
    "/admin/funcionarios",
    "/admin/qr-tokens",
    "/admin/pontos",
  ];

  for (const prefix of adminPrefixes) {
    const matchingLayers = apiRouter.stack.filter((layer) =>
      layer.matchers.some((matcher) => matcher(prefix))
    );

    assert.ok(
      matchingLayers.some(
        (layer) => layer.handle === ensureAdminApiAuthenticated
      ),
      `${prefix} deve usar ensureAdminApiAuthenticated`
    );
  }
});
