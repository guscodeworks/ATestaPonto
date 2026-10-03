"use strict";

// Teste de integração das rotas /admin/escolas: valida a cadeia real
// (autorização por capacidade -> validador -> escopo da DRE -> controller -> erro JSON),
// com models e BrasilAPI simulados.
const padroes = {
  DB_HOST: "127.0.0.1",
  DB_USER: "teste",
  DB_NAME: "ponto_teste",
  JWT_SECRET: "Teste-Jwt-Secret_9#aZ-longo-o-bastante-1234567890",
  SESSION_SECRET: "Teste-Session-Secret_7#bY-longo-o-bastante-0987654321",
  JWT_EXPIRES_IN: "8h",
  CORS_ORIGIN: "http://127.0.0.1:3000",
  GOVBR_AUTHORIZE_URL: "http://127.0.0.1:4000/fake-govbr/authorize",
  GOVBR_TOKEN_URL: "http://127.0.0.1:4000/fake-govbr/token",
  GOVBR_USERINFO_URL: "http://127.0.0.1:4000/fake-govbr/userinfo",
  GOVBR_CLIENT_ID: "ponto-escolar",
  GOVBR_CLIENT_SECRET: "segredo-de-teste",
  GOVBR_REDIRECT_URI: "http://127.0.0.1:3000/auth/govbr/callback",
  ADMIN_GOVBR_EMAILS: "admin@example.invalid",
};
for (const [chave, valor] of Object.entries(padroes)) {
  if (!process.env[chave]) process.env[chave] = valor;
}

const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");
const express = require("express");
const schoolUnitModel = require("../src/models/schoolUnitModel");
const educationDepartmentModel = require("../src/models/educationDepartmentModel");
const { logger } = require("../src/utils/logger");
const adminSchoolRoutes = require("../src/routes/adminSchoolRoutes");
const { errorMiddleware } = require("../src/middlewares/errorMiddleware");

const CEP_OK = {
  cep: "13010100",
  state: "SP",
  city: "Campinas",
  neighborhood: "Centro",
  street: "Rua Barao de Jaguara",
  location: { type: "Point", coordinates: { longitude: "-47.0608", latitude: "-22.9056" } },
};

// Sobe o app com um "admin" autenticado, definido pelo teste, no lugar da sessão Gov.br.
async function subirApp(acessos) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { id: 7, role: "admin" };
    req.acessos = acessos;
    next();
  });
  app.use("/api/admin/escolas", adminSchoolRoutes);
  app.use(errorMiddleware);

  const servidor = http.createServer(app);
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}/api/admin/escolas`;
  return { base, fechar: () => new Promise((resolve) => servidor.close(resolve)) };
}

function mockBanco(t) {
  const inserts = [];
  t.mock.method(logger, "info", () => {});
  t.mock.method(logger, "error", () => {});
  t.mock.method(educationDepartmentModel, "findById", async (id) => ({ id, nome: "DRE", ativo: 1 }));
  t.mock.method(educationDepartmentModel, "findByIdForUpdate", async (_tx, id) => ({ id, ativo: 1 }));
  t.mock.method(schoolUnitModel, "withTransaction", async (cb) => cb({}));
  t.mock.method(schoolUnitModel, "findByCodigoInep", async () => null);
  t.mock.method(schoolUnitModel, "findByNomeNaDiretoria", async () => null);
  t.mock.method(schoolUnitModel, "createSchoolUnit", async (_tx, dados) => {
    inserts.push(dados);
    return { insertId: 55 };
  });
  t.mock.method(schoolUnitModel, "findAdminById", async (id) => ({
    id, diretoria_ensino_id: inserts[0]?.diretoriaEnsinoId ?? 1, diretoria_ensino_nome: "DRE",
    nome: "EE Teste", codigo_inep: null, cep: "13010100", endereco: "Rua", numero: null,
    bairro: "Centro", cidade: "Campinas", uf: "SP", cep_verificado: 1, latitude: -22.9,
    longitude: -47.06, origem_coordenadas: "BRASILAPI", raio_permitido_metros: 100, ativa: 1,
    criado_em: null, atualizado_em: null,
  }));
  return inserts;
}

function mockBrasilApi(t, status = 200, body = CEP_OK) {
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, opcoes) => {
    // Só intercepta a BrasilAPI; o cliente de teste usa o fetch real.
    if (!String(url).includes("brasilapi")) return realFetch(url, opcoes);
    return { status, ok: status < 300, json: async () => body };
  });
}

const post = (base, corpo) =>
  fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

test("POST /escolas: SEDUC cadastra (201) e retorna avisos", async (t) => {
  const inserts = mockBanco(t);
  mockBrasilApi(t);
  const { base, fechar } = await subirApp([{ id: 1, perfil: "ADMIN_SEDUC" }]);
  t.after(fechar);

  const resposta = await post(base, { diretoria_ensino_id: 3, nome: "EE Escola Teste", cep: "13010-100" });
  const json = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.equal(json.success, true);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].cep, "13010100");
  assert.ok(Array.isArray(json.data.avisos));
});

test("POST /escolas: DIRETORIA em DRE alheia recebe 403 e nada e gravado", async (t) => {
  const inserts = mockBanco(t);
  mockBrasilApi(t);
  const { base, fechar } = await subirApp([{ id: 2, perfil: "ADMIN_DIRETORIA", diretoria_ensino_id: 1 }]);
  t.after(fechar);

  const resposta = await post(base, { diretoria_ensino_id: 2, nome: "EE Escola Teste", cep: "13010100" });

  assert.equal(resposta.status, 403);
  assert.equal(inserts.length, 0);
  const propria = await post(base, { diretoria_ensino_id: 1, nome: "EE Escola Teste", cep: "13010100" });
  assert.equal(propria.status, 201);
});

test("POST /escolas: perfil escolar recebe 403 mesmo com payload valido", async (t) => {
  const inserts = mockBanco(t);
  mockBrasilApi(t);
  const { base, fechar } = await subirApp([{ id: 3, perfil: "DIRETOR", unidade_escolar_id: 10 }]);
  t.after(fechar);

  const resposta = await post(base, { diretoria_ensino_id: 1, nome: "EE Escola Teste", cep: "13010100" });
  assert.equal(resposta.status, 403);
  assert.equal(inserts.length, 0);

  const diretorias = await fetch(`${base}/diretorias`);
  assert.equal(diretorias.status, 403);
  const cep = await fetch(`${base}/cep/13010100`);
  assert.equal(cep.status, 403);
});

test("POST /escolas: validador devolve 422 para CEP, nome e coordenadas invalidos", async (t) => {
  mockBanco(t);
  mockBrasilApi(t);
  const { base, fechar } = await subirApp([{ id: 1, perfil: "ADMIN_SEDUC" }]);
  t.after(fechar);

  for (const corpo of [
    { diretoria_ensino_id: 1, nome: "EE Escola Teste", cep: "123" },
    { diretoria_ensino_id: 1, nome: "EE Escola Teste", cep: "00000000" },
    { diretoria_ensino_id: 1, nome: "ab", cep: "13010100" },
    { diretoria_ensino_id: "x", nome: "EE Escola Teste", cep: "13010100" },
    { diretoria_ensino_id: 1, nome: "EE Escola Teste", cep: "13010100", latitude: 200, longitude: 1 },
  ]) {
    const resposta = await post(base, corpo);
    const json = await resposta.json();
    assert.equal(resposta.status, 422, JSON.stringify(corpo));
    assert.equal(json.error.code, "VALIDATION_ERROR");
  }
});

test("POST /escolas: CEP 404 na BrasilAPI vira 422 e nao grava", async (t) => {
  const inserts = mockBanco(t);
  mockBrasilApi(t, 404, {});
  const { base, fechar } = await subirApp([{ id: 1, perfil: "ADMIN_SEDUC" }]);
  t.after(fechar);

  const resposta = await post(base, { diretoria_ensino_id: 1, nome: "EE Escola Teste", cep: "13010100" });
  const json = await resposta.json();
  assert.equal(resposta.status, 422);
  assert.equal(json.error.code, "CEP_NAO_ENCONTRADO");
  assert.equal(inserts.length, 0);
});

test("GET /escolas/cep/:cep: 200 com dados, 404 quando nao existe e 503 se indisponivel", async (t) => {
  mockBanco(t);
  mockBrasilApi(t);
  const { base, fechar } = await subirApp([{ id: 2, perfil: "ADMIN_DIRETORIA", diretoria_ensino_id: 1 }]);
  t.after(fechar);

  const ok = await (await fetch(`${base}/cep/13010-100`)).json();
  assert.equal(ok.data.geolocalizacao_disponivel, true);

  t.mock.restoreAll();
  mockBanco(t);
  mockBrasilApi(t, 404, {});
  assert.equal((await fetch(`${base}/cep/13010100`)).status, 404);

  t.mock.restoreAll();
  mockBanco(t);
  mockBrasilApi(t, 500, {});
  assert.equal((await fetch(`${base}/cep/13010100`)).status, 503);

  assert.equal((await fetch(`${base}/cep/abc`)).status, 422);
});

test("GET /escolas/:id: fora do escopo e inexistente respondem 403; dentro, 200", async (t) => {
  mockBanco(t);
  t.mock.method(schoolUnitModel, "findById", async (id) =>
    id === 10 ? { id: 10, diretoria_ensino_id: 1 } : id === 20 ? { id: 20, diretoria_ensino_id: 2 } : null
  );
  const { base, fechar } = await subirApp([{ id: 2, perfil: "ADMIN_DIRETORIA", diretoria_ensino_id: 1 }]);
  t.after(fechar);

  assert.equal((await fetch(`${base}/10`)).status, 200);
  assert.equal((await fetch(`${base}/20`)).status, 403);
  assert.equal((await fetch(`${base}/999`)).status, 403);
  assert.equal((await fetch(`${base}/abc`)).status, 422);
});
