"use strict";

// Valores mínimos só para o env.js carregar quando não houver .env (CI).
// Nunca sobrescreve o que já está configurado e não contém credenciais reais.
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
const { test } = require("node:test");
const schoolUnitModel = require("../src/models/schoolUnitModel");
const educationDepartmentModel = require("../src/models/educationDepartmentModel");
const { logger } = require("../src/utils/logger");
const cepService = require("../src/services/cepService");
const schoolUnitService = require("../src/services/schoolUnitService");

const CEP_OK = {
  cep: "13010100",
  state: "SP",
  city: "Campinas",
  neighborhood: "Centro",
  street: "Rua Barao de Jaguara",
  service: "viacep",
  location: { type: "Point", coordinates: { longitude: "-47.0608", latitude: "-22.9056" } },
};

const ACESSO_SEDUC = { id: 1, perfil: "ADMIN_SEDUC" };
const acessoDiretoria = (diretoriaId) => ({
  id: 2,
  perfil: "ADMIN_DIRETORIA",
  diretoria_ensino_id: diretoriaId,
});
const ACESSO_DIRETOR = { id: 3, perfil: "DIRETOR", unidade_escolar_id: 10 };

const payloadBase = (extra = {}) => ({
  diretoria_ensino_id: 1,
  nome: "EE Escola Teste",
  cep: "13010100",
  ...extra,
});

// Simula o fetch da BrasilAPI e conta as chamadas.
function mockFetch(t, resposta) {
  const chamadas = [];
  t.mock.method(globalThis, "fetch", async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    if (resposta instanceof Error) throw resposta;
    return {
      status: resposta.status,
      ok: resposta.status >= 200 && resposta.status < 300,
      json: async () => {
        if (resposta.jsonInvalido) throw new SyntaxError("json invalido");
        return resposta.body;
      },
    };
  });
  return chamadas;
}

// Simula models; `gravacoes` registra o que chegaria ao banco.
function mockModels(t, { nomeDuplicado = false, inepDuplicado = false } = {}) {
  const gravacoes = { transacoes: 0, inserts: [] };
  t.mock.method(logger, "info", () => {});
  t.mock.method(educationDepartmentModel, "findById", async (id) => ({ id, nome: `DRE ${id}`, ativo: 1 }));
  t.mock.method(educationDepartmentModel, "findByIdForUpdate", async (_tx, id) => ({ id, ativo: 1 }));
  t.mock.method(schoolUnitModel, "withTransaction", async (callback) => {
    gravacoes.transacoes += 1;
    return callback({});
  });
  t.mock.method(schoolUnitModel, "findByCodigoInep", async () => (inepDuplicado ? { id: 99 } : null));
  t.mock.method(schoolUnitModel, "findByNomeNaDiretoria", async () => (nomeDuplicado ? { id: 98 } : null));
  t.mock.method(schoolUnitModel, "createSchoolUnit", async (_tx, dados) => {
    gravacoes.inserts.push(dados);
    return { insertId: 55 };
  });
  t.mock.method(schoolUnitModel, "findAdminById", async (id) => {
    const d = gravacoes.inserts[0];
    return {
      id,
      diretoria_ensino_id: d.diretoriaEnsinoId,
      diretoria_ensino_nome: "DRE",
      nome: d.nome,
      codigo_inep: d.codigoInep,
      cep: d.cep,
      endereco: d.logradouro,
      numero: d.numero,
      bairro: d.bairro,
      cidade: d.cidade,
      uf: d.uf,
      cep_verificado: d.cepVerificado ? 1 : 0,
      latitude: d.latitude,
      longitude: d.longitude,
      origem_coordenadas: d.origemCoordenadas,
      raio_permitido_metros: d.raioPermitidoMetros,
      ativa: 1,
      criado_em: null,
      atualizado_em: null,
    };
  });
  return gravacoes;
}

const contexto = (...acessos) => ({ adminId: 7, ipOrigem: "127.0.0.1", acessos });

// ----------------------------- cepService ----------------------------------

test("cepService aproveita só o necessário e converte coordenadas", async (t) => {
  const chamadas = mockFetch(t, { status: 200, body: CEP_OK });
  const dados = await cepService.consultarCep("13010-100");

  assert.match(chamadas[0].url, /\/cep\/v2\/13010100$/);
  assert.deepEqual(dados, {
    cep: "13010100",
    logradouro: "Rua Barao de Jaguara",
    bairro: "Centro",
    cidade: "Campinas",
    uf: "SP",
    latitude: -22.9056,
    longitude: -47.0608,
  });
});

test("cepService descarta coordenadas vazias, incompletas ou fora do Brasil", async (t) => {
  for (const coordinates of [
    {},
    { latitude: "-22.9" },
    { latitude: "0", longitude: "0" },
    { latitude: "abc", longitude: "-47" },
  ]) {
    t.mock.restoreAll();
    mockFetch(t, { status: 200, body: { ...CEP_OK, location: { type: "Point", coordinates } } });
    const dados = await cepService.consultarCep("13010100");
    assert.equal(dados.latitude, null);
    assert.equal(dados.longitude, null);
  }
});

test("cepService rejeita CEP invalido sem chamar a API", async (t) => {
  const chamadas = mockFetch(t, { status: 200, body: CEP_OK });
  for (const cep of ["123", "abcdefgh", "00000000", "", null, "1301010000"]) {
    await assert.rejects(() => cepService.consultarCep(cep), { code: "VALIDATION_ERROR" });
  }
  assert.equal(chamadas.length, 0);
});

test("cepService trata 404, 5xx, 429, timeout, rede e resposta invalida", async (t) => {
  mockFetch(t, { status: 404 });
  await assert.rejects(() => cepService.consultarCep("13010100"), { code: "CEP_NAO_ENCONTRADO", statusCode: 404 });

  t.mock.restoreAll();
  mockFetch(t, { status: 500 });
  await assert.rejects(() => cepService.consultarCep("13010100"), { code: "CEP_INDISPONIVEL", statusCode: 503 });

  t.mock.restoreAll();
  mockFetch(t, { status: 429 });
  await assert.rejects(() => cepService.consultarCep("13010100"), { code: "CEP_LIMITE_PROVEDOR", statusCode: 503 });

  t.mock.restoreAll();
  mockFetch(t, Object.assign(new Error("tempo"), { name: "TimeoutError" }));
  await assert.rejects(() => cepService.consultarCep("13010100"), { code: "CEP_TIMEOUT", statusCode: 504 });

  t.mock.restoreAll();
  mockFetch(t, new TypeError("fetch failed"));
  await assert.rejects(() => cepService.consultarCep("13010100"), { code: "CEP_INDISPONIVEL", statusCode: 503 });

  t.mock.restoreAll();
  mockFetch(t, { status: 200, jsonInvalido: true });
  await assert.rejects(() => cepService.consultarCep("13010100"), { code: "CEP_RESPOSTA_INVALIDA", statusCode: 502 });

  t.mock.restoreAll();
  mockFetch(t, { status: 200, body: { ...CEP_OK, cep: "99999999" } });
  await assert.rejects(() => cepService.consultarCep("13010100"), { code: "CEP_RESPOSTA_INVALIDA" });
});

// ------------------------ escopo do cadastro --------------------------------

test("perfil escolar nao cadastra escola e nada externo e chamado", async (t) => {
  const chamadas = mockFetch(t, { status: 200, body: CEP_OK });
  const gravacoes = mockModels(t);

  await assert.rejects(
    () => schoolUnitService.createSchoolUnit(payloadBase(), contexto(ACESSO_DIRETOR)),
    { statusCode: 403 }
  );
  assert.equal(chamadas.length, 0);
  assert.equal(gravacoes.transacoes, 0);
});

test("ADMIN_DIRETORIA so cadastra na propria DRE", async (t) => {
  const chamadas = mockFetch(t, { status: 200, body: CEP_OK });
  const gravacoes = mockModels(t);

  await assert.rejects(
    () => schoolUnitService.createSchoolUnit(payloadBase({ diretoria_ensino_id: 2 }), contexto(acessoDiretoria(1))),
    { statusCode: 403, message: /fora do escopo/ }
  );
  assert.equal(chamadas.length, 0);
  assert.equal(gravacoes.transacoes, 0);

  const criada = await schoolUnitService.createSchoolUnit(payloadBase(), contexto(acessoDiretoria(1)));
  assert.equal(criada.diretoria_ensino_id, 1);
  assert.equal(gravacoes.inserts.length, 1);
});

test("ADMIN_SEDUC cadastra em qualquer DRE", async (t) => {
  mockFetch(t, { status: 200, body: CEP_OK });
  const gravacoes = mockModels(t);

  const criada = await schoolUnitService.createSchoolUnit(
    payloadBase({ diretoria_ensino_id: 2 }),
    contexto(ACESSO_SEDUC)
  );
  assert.equal(criada.diretoria_ensino_id, 2);
  assert.equal(gravacoes.inserts.length, 1);
});

test("DRE inexistente e recusada com 422 antes de consultar o CEP", async (t) => {
  const chamadas = mockFetch(t, { status: 200, body: CEP_OK });
  mockModels(t);
  t.mock.method(educationDepartmentModel, "findById", async () => null);

  await assert.rejects(
    () => schoolUnitService.createSchoolUnit(payloadBase({ diretoria_ensino_id: 999 }), contexto(ACESSO_SEDUC)),
    { statusCode: 422 }
  );
  assert.equal(chamadas.length, 0);
});

// --------------------------- uso do CEP --------------------------------------

test("sem dados manuais, endereco e coordenadas vem da BrasilAPI", async (t) => {
  mockFetch(t, { status: 200, body: CEP_OK });
  const gravacoes = mockModels(t);

  const criada = await schoolUnitService.createSchoolUnit(payloadBase(), contexto(ACESSO_SEDUC));

  assert.equal(criada.cep_verificado, true);
  assert.equal(criada.origem_coordenadas, "BRASILAPI");
  assert.equal(criada.logradouro, "Rua Barao de Jaguara");
  assert.equal(criada.latitude, -22.9056);
  assert.equal(gravacoes.inserts[0].raioPermitidoMetros, 100);
  assert.deepEqual(criada.avisos, []);
});

test("o que o administrador informou prevalece sobre a BrasilAPI e gera aviso", async (t) => {
  mockFetch(t, { status: 200, body: CEP_OK });
  mockModels(t);

  const criada = await schoolUnitService.createSchoolUnit(
    payloadBase({
      logradouro: "Rua do Colegio",
      cidade: "Valinhos",
      latitude: -22.97,
      longitude: -46.99, // ~8 km do ponto do CEP
    }),
    contexto(ACESSO_SEDUC)
  );

  assert.equal(criada.logradouro, "Rua do Colegio");
  assert.equal(criada.cidade, "Valinhos");
  assert.equal(criada.origem_coordenadas, "MANUAL");
  assert.equal(criada.latitude, -22.97);
  assert.equal(criada.cep_verificado, true);
  assert.equal(criada.avisos.length, 2); // cidade e coordenadas divergentes
});

test("CEP nao encontrado sem confirmacao manual nao grava nada", async (t) => {
  mockFetch(t, { status: 404 });
  const gravacoes = mockModels(t);

  await assert.rejects(
    () => schoolUnitService.createSchoolUnit(payloadBase(), contexto(ACESSO_SEDUC)),
    { statusCode: 422, code: "CEP_NAO_ENCONTRADO" }
  );
  assert.equal(gravacoes.transacoes, 0);
  assert.equal(gravacoes.inserts.length, 0);
});

test("timeout e indisponibilidade sem confirmacao manual nao gravam nada", async (t) => {
  const gravacoes = mockModels(t);

  mockFetch(t, Object.assign(new Error("tempo"), { name: "TimeoutError" }));
  await assert.rejects(
    () => schoolUnitService.createSchoolUnit(payloadBase(), contexto(ACESSO_SEDUC)),
    { statusCode: 504, code: "CEP_TIMEOUT" }
  );

  t.mock.method(globalThis, "fetch", async () => ({ status: 503, ok: false }));
  await assert.rejects(
    () => schoolUnitService.createSchoolUnit(payloadBase(), contexto(ACESSO_SEDUC)),
    { statusCode: 503 }
  );
  assert.equal(gravacoes.transacoes, 0);
});

test("confirmacao manual sem endereco/coordenadas completos continua recusada", async (t) => {
  mockFetch(t, { status: 404 });
  const gravacoes = mockModels(t);

  await assert.rejects(
    () =>
      schoolUnitService.createSchoolUnit(
        payloadBase({ endereco_manual_confirmado: true, logradouro: "Rua X" }),
        contexto(ACESSO_SEDUC)
      ),
    { code: "CEP_NAO_ENCONTRADO" }
  );
  assert.equal(gravacoes.transacoes, 0);
});

test("API fora do ar com endereco manual confirmado grava como nao verificado", async (t) => {
  mockFetch(t, new TypeError("fetch failed"));
  const gravacoes = mockModels(t);

  const criada = await schoolUnitService.createSchoolUnit(
    payloadBase({
      endereco_manual_confirmado: true,
      logradouro: "Rua do Colegio",
      bairro: "Centro",
      cidade: "Campinas",
      uf: "sp",
      latitude: -22.9,
      longitude: -47.06,
    }),
    contexto(ACESSO_SEDUC)
  );

  assert.equal(criada.cep_verificado, false);
  assert.equal(criada.origem_coordenadas, "MANUAL");
  assert.equal(criada.uf, "SP");
  assert.equal(gravacoes.inserts.length, 1);
  assert.match(criada.avisos[0], /nao verificado/);
});

test("CEP sem geolocalizacao exige coordenadas manuais e nao grava valor inventado", async (t) => {
  mockFetch(t, {
    status: 200,
    body: { ...CEP_OK, location: { type: "Point", coordinates: {} } },
  });
  const gravacoes = mockModels(t);

  await assert.rejects(
    () => schoolUnitService.createSchoolUnit(payloadBase(), contexto(ACESSO_SEDUC)),
    { statusCode: 422, message: /Coordenadas indisponiveis/ }
  );
  assert.equal(gravacoes.inserts.length, 0);
});

test("coordenadas manuais fora do Brasil ou incompletas sao recusadas", async (t) => {
  mockFetch(t, { status: 200, body: CEP_OK });
  mockModels(t);

  await assert.rejects(
    () => schoolUnitService.createSchoolUnit(payloadBase({ latitude: 0, longitude: 0 }), contexto(ACESSO_SEDUC)),
    { statusCode: 422 }
  );
  await assert.rejects(
    () => schoolUnitService.createSchoolUnit(payloadBase({ latitude: -22.9 }), contexto(ACESSO_SEDUC)),
    { statusCode: 422 }
  );
});

test("nome ou INEP duplicado resulta em 409 sem inserir", async (t) => {
  mockFetch(t, { status: 200, body: CEP_OK });
  let gravacoes = mockModels(t, { nomeDuplicado: true });
  await assert.rejects(
    () => schoolUnitService.createSchoolUnit(payloadBase(), contexto(ACESSO_SEDUC)),
    { statusCode: 409 }
  );
  assert.equal(gravacoes.inserts.length, 0);

  t.mock.restoreAll();
  mockFetch(t, { status: 200, body: CEP_OK });
  gravacoes = mockModels(t, { inepDuplicado: true });
  await assert.rejects(
    () => schoolUnitService.createSchoolUnit(payloadBase({ codigo_inep: "12345678" }), contexto(ACESSO_SEDUC)),
    { statusCode: 409, message: /INEP/ }
  );
  assert.equal(gravacoes.inserts.length, 0);
});

// ------------------------------ consulta -------------------------------------

test("listDiretoriasParaCadastro respeita o escopo do perfil", async (t) => {
  t.mock.method(educationDepartmentModel, "list", async () => [
    { id: 1, nome: "DRE 1", codigo: "A", cidade_sede: "Campinas" },
    { id: 2, nome: "DRE 2", codigo: "B", cidade_sede: "Jundiai" },
  ]);

  const seduc = await schoolUnitService.listDiretoriasParaCadastro([ACESSO_SEDUC]);
  assert.deepEqual(seduc.map((d) => d.id), [1, 2]);

  const diretoria = await schoolUnitService.listDiretoriasParaCadastro([acessoDiretoria(2)]);
  assert.deepEqual(diretoria.map((d) => d.id), [2]);

  const escolar = await schoolUnitService.listDiretoriasParaCadastro([ACESSO_DIRETOR]);
  assert.deepEqual(escolar, []);
});

test("listSchoolUnits repassa o escopo e pagina", async (t) => {
  let filtrosRecebidos;
  t.mock.method(schoolUnitModel, "countForAdmin", async () => ({ total: 1 }));
  t.mock.method(schoolUnitModel, "listForAdmin", async (filtros) => {
    filtrosRecebidos = filtros;
    return [
      {
        id: 10, diretoria_ensino_id: 1, diretoria_ensino_nome: "DRE 1", nome: "EE A", codigo_inep: null,
        cep: "13010100", endereco: "Rua A", numero: null, bairro: "Centro", cidade: "Campinas", uf: "SP",
        cep_verificado: 1, latitude: -22.9, longitude: -47.06, origem_coordenadas: "BRASILAPI",
        raio_permitido_metros: 100, ativa: 1, criado_em: null, atualizado_em: null,
      },
    ];
  });

  const resultado = await schoolUnitService.listSchoolUnits({ page: "2", limit: "5", ativa: "true" }, [10, 11]);

  assert.deepEqual(filtrosRecebidos.escopoUnidades, [10, 11]);
  assert.equal(filtrosRecebidos.offset, 5);
  assert.equal(filtrosRecebidos.ativa, true);
  assert.equal(resultado.pagination.total, 1);
  assert.equal(resultado.items[0].ativa, true);
});
