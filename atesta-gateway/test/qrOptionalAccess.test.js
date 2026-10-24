"use strict";

// QR é só atalho: as páginas de login abrem com ou sem token, sem sessão QR nem Redis.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");

// Middlewares admin carregam env.js/Spring; estas rotas de funcionário não dependem deles.
const stub = (file, exports) => {
  const id = require.resolve(path.join(__dirname, "../src/middlewares", file));
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
const deny = (_req, res) => res.sendStatus(401);
stub("ensureAdminAuthenticated.js", deny);
stub("adminScope.js", { escopoPorCapacidade: () => deny, exigirCapacidade: () => deny });

const { createPagesRouter } = require("../src/routes/pages.routes");

test("login abre por acesso direto e por QR válido ou inválido", async (t) => {
  const app = express();
  app.use(createPagesRouter({ sendView: (res, view) => res.type("html").send(view) }));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const url of ["/", "/login", "/ponto/acessar", `/ponto/acessar?qr=${"A".repeat(43)}`,
    "/ponto/acessar?qr=invalido", "/ponto/acessar?qr=a&qr=b", "/login?qr=invalido"]) {
    const response = await fetch(base + url, { redirect: "manual" });
    assert.equal(response.status, 200, url);
    assert.equal(await response.text(), "index.html", url);
    assert.equal(response.headers.get("set-cookie"), null, url);
  }
});
