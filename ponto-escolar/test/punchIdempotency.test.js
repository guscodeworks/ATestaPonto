"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const pointModel = require("../src/models/pointModel");
const employeeModel = require("../src/models/employeeModel");
const employmentLinkModel = require("../src/models/employmentLinkModel");
const schoolUnitModel = require("../src/models/schoolUnitModel");
const { logger } = require("../src/utils/logger");
const { registerPunch } = require("../src/services/punchService");

test("registro de ponto reutiliza resposta, rejeita outro hash e reverte falha", async (t) => {
  let rows = [];
  let saved = new Map();
  let active = true;
  let failSave = false;
  let lock = Promise.resolve();
  let auditCount = 0;

  t.mock.method(pointModel, "withTransaction", async (callback) => {
    const previous = lock;
    let release;
    lock = new Promise((resolve) => { release = resolve; });
    await previous;
    const tx = { rows: [...rows], saved: new Map(saved) };
    try {
      const result = await callback(tx);
      rows = tx.rows;
      saved = tx.saved;
      return result;
    } finally {
      release();
    }
  });
  t.mock.method(employeeModel, "findForPunchRegisterByIdForUpdate", async () => ({
    id: 7, nome: "Teste", email: "teste@example.invalid", cpf: "00000000000", ativo: active,
  }));
  t.mock.method(pointModel, "findIdempotencyForUpdate", async (tx, id, key) => tx.saved.get(`${id}:${key}`) || null);
  t.mock.method(employmentLinkModel, "findActiveByFuncionarioIdForUpdate", async () => ({ id: 11 }));
  t.mock.method(schoolUnitModel, "findGeolocationByVinculo", async () => ({
    latitude: 0, longitude: 0, raio_permitido_metros: 500,
  }));
  t.mock.method(pointModel, "findByEmployeeAndDateForUpdate", async (tx) => tx.rows);
  t.mock.method(pointModel, "createFirstPunch", async (tx, input) => {
    tx.rows.push({ id: 31, tipo: "ENTRADA", registrado_em: `${input.date} ${input.time}` });
    return { insertId: 31 };
  });
  t.mock.method(pointModel, "saveIdempotency", async (tx, id, key, hash, response) => {
    if (failSave) throw new Error("falha ao salvar resposta");
    tx.saved.set(`${id}:${key}`, { requisicao_hash: hash, resposta: JSON.stringify(response) });
  });
  t.mock.method(logger, "info", () => { auditCount += 1; });

  const request = {
    funcionarioId: 7, latitude: 0, longitude: 0, accuracy: 10,
    timestamp: Date.now(), chaveIdempotencia: "123e4567-e89b-42d3-a456-426614174000",
  };

  failSave = true;
  await assert.rejects(registerPunch(request), /falha ao salvar resposta/);
  assert.equal(rows.length, 0);
  assert.equal(saved.size, 0);

  failSave = false;
  const [first, repeated] = await Promise.all([registerPunch(request), registerPunch(request)]);
  assert.deepEqual(repeated, first);
  assert.equal(rows.length, 1);
  assert.equal(saved.size, 1);
  const stored = saved.get(`7:${request.chaveIdempotencia}`);
  assert.match(stored.requisicao_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(JSON.parse(stored.resposta), first);
  assert.equal(auditCount, 1);

  await assert.rejects(registerPunch({ ...request, longitude: 0.001 }), (error) => error.statusCode === 409);
  assert.equal(rows.length, 1);

  active = false;
  assert.deepEqual(await registerPunch(request), first);
  assert.equal(rows.length, 1);
  assert.equal(auditCount, 1);
});
