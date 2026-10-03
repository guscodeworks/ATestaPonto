"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const schoolModel = {
  findByIds: async () => [],
  list: async () => [],
  create: async () => null,
};
const departmentModel = {
  findById: async (id) => ({ id, nome: "DRE de teste", codigo: "01", ativo: true }),
  list: async () => [{ id: 1, nome: "DRE estadual", codigo: "01", ativo: true }],
};
const accessProfiles = {
  PERFIL_SEDUC: "ADMIN_SEDUC",
  PERFIL_DIRETORIA: "ADMIN_DIRETORIA",
};
const dependencyMocks = {
  "../models/schoolUnitModel": schoolModel,
  "../models/educationDepartmentModel": departmentModel,
  "../middlewares/adminScope": accessProfiles,
};
const originalModuleLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith(`${path.sep}schoolUnitService.js`) && dependencyMocks[request]) {
    return dependencyMocks[request];
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};
const schoolUnitService = require("../src/services/schoolUnitService");
Module._load = originalModuleLoad;

const originalFetch = global.fetch;

beforeEach(() => {
  schoolModel.findByIds = async () => [];
  schoolModel.list = async () => [];
  schoolModel.create = async () => null;
  departmentModel.findById = async (id) => ({ id, nome: "DRE de teste", codigo: "01", ativo: true });
  departmentModel.list = async () => [{ id: 1, nome: "DRE estadual", codigo: "01", ativo: true }];
});

afterEach(() => {
  global.fetch = originalFetch;
});

test("DRE lista unidades do escopo e pode cadastrar na própria diretoria", async () => {
  let requestedIds;
  let inserted;
  schoolModel.findByIds = async (ids) => {
    requestedIds = ids;
    return [];
  };
  schoolModel.create = async (_client, values) => {
    inserted = values;
    return {
      id: 9,
      diretoria_ensino_id: values.diretoriaEnsinoId,
      nome: values.nome,
      endereco: values.endereco,
      cidade: values.cidade,
      ativa: 1,
    };
  };

  const acessos = [{ perfil: "ADMIN_DIRETORIA", diretoria_ensino_id: 7 }];
  const escopo = { isSeduc: false, diretoriasPermitidas: new Set([7]) };
  const listing = await schoolUnitService.getSchoolManagement({
    escopo,
    escopoUnidades: [31, 32],
    acessos,
  });

  assert.deepEqual(requestedIds, [31, 32]);
  assert.equal(listing.capabilities.canCreate, true);
  assert.equal(listing.capabilities.canChooseDepartment, false);

  const result = await schoolUnitService.createSchool(
    { diretoria_ensino_id: 7, nome: "Escola teste", endereco: "Rua 1", cidade: "Cidade" },
    { escopo, acessos }
  );
  assert.equal(inserted.diretoriaEnsinoId, 7);
  assert.equal(result.escola.id, 9);
});

test("bloqueia criação fora do escopo e para perfil sem capacidade", async () => {
  let createCalls = 0;
  schoolModel.create = async () => {
    createCalls += 1;
  };
  const escopo = { isSeduc: false, diretoriasPermitidas: new Set([7]) };

  await assert.rejects(
    schoolUnitService.createSchool(
      { diretoria_ensino_id: 8, nome: "Escola", endereco: "Rua", cidade: "Cidade" },
      { escopo, acessos: [{ perfil: "ADMIN_DIRETORIA", diretoria_ensino_id: 7 }] }
    ),
    (error) => error.statusCode === 403
  );
  await assert.rejects(
    schoolUnitService.createSchool(
      { diretoria_ensino_id: 7, nome: "Escola", endereco: "Rua", cidade: "Cidade" },
      { escopo, acessos: [{ perfil: "SECRETARIA", unidade_escolar_id: 31 }] }
    ),
    (error) => error.statusCode === 403
  );
  assert.equal(createCalls, 0);
});

test("SEDUC pode selecionar entre diretorias ativas", async () => {
  departmentModel.list = async () => [
    { id: 1, nome: "DRE Norte", codigo: "01", ativo: true },
    { id: 2, nome: "DRE Sul", codigo: "02", ativo: true },
  ];

  const listing = await schoolUnitService.getSchoolManagement({
    escopo: { isSeduc: true, diretoriasPermitidas: new Set() },
    escopoUnidades: null,
    acessos: [{ perfil: "ADMIN_SEDUC" }],
  });

  assert.equal(listing.capabilities.canCreate, true);
  assert.equal(listing.capabilities.canChooseDepartment, true);
  assert.deepEqual(listing.diretorias.map((department) => department.id), [1, 2]);
});

test("CEP não encontrado retorna estado vazio da consulta", async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ erro: true }) });
  assert.deepEqual(await schoolUnitService.lookupPostalCode("00000000"), { found: false });
});

test("falha do serviço de CEP é exposta como erro tratável", async () => {
  global.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(
    schoolUnitService.lookupPostalCode("01001000"),
    (error) => error.statusCode === 502 && error.code === "POSTAL_CODE_LOOKUP_UNAVAILABLE"
  );
});