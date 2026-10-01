"use strict";

const schoolUnitModel = require("../models/schoolUnitModel");
const educationDepartmentModel = require("../models/educationDepartmentModel");
const { PERFIL_SEDUC, PERFIL_DIRETORIA } = require("../middlewares/adminScope");
const { ForbiddenError, NotFoundError, AppError } = require("../utils/errors");

function mapSchool(school) {
  return {
    id: Number(school.id),
    diretoria_ensino_id: Number(school.diretoria_ensino_id),
    nome: school.nome,
    codigo_inep: school.codigo_inep || null,
    endereco: school.endereco || "",
    cidade: school.cidade || "",
    ativa: Boolean(school.ativa),
  };
}

function canCreateSchool(acessos = [], escopo = {}) {
  return Boolean(
    escopo.isSeduc ||
      acessos.some((acesso) => acesso.perfil === PERFIL_DIRETORIA)
  );
}

async function getDepartments(acessos = [], escopo = {}) {
  if (escopo.isSeduc) {
    return educationDepartmentModel.list({ ativo: true });
  }

  if (!acessos.some((acesso) => acesso.perfil === PERFIL_DIRETORIA)) {
    return [];
  }

  const departmentIds = [...(escopo.diretoriasPermitidas || [])];
  const departments = await Promise.all(
    departmentIds.map((id) => educationDepartmentModel.findById(id))
  );
  return departments.filter((department) => department && department.ativo);
}

async function getSchoolManagement({ escopo, escopoUnidades, acessos }) {
  const [schools, departments] = await Promise.all([
    escopoUnidades === null
      ? schoolUnitModel.list()
      : schoolUnitModel.findByIds(escopoUnidades),
    getDepartments(acessos, escopo),
  ]);

  return {
    items: schools.map(mapSchool),
    diretorias: departments.map((department) => ({
      id: Number(department.id),
      nome: department.nome,
      codigo: department.codigo,
    })),
    capabilities: {
      canCreate: canCreateSchool(acessos, escopo) && departments.length > 0,
      canChooseDepartment: Boolean(escopo.isSeduc),
    },
  };
}

async function createSchool(body = {}, { escopo, acessos }) {
  if (!canCreateSchool(acessos, escopo)) {
    throw new ForbiddenError("Perfil do administrador nao permite cadastrar escolas");
  }

  const departmentId = Number(body.diretoria_ensino_id);
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    throw new NotFoundError("Diretoria de ensino nao encontrada");
  }

  const departments = await getDepartments(acessos, escopo);
  const department = departments.find((item) => Number(item.id) === departmentId);
  if (!department) {
    throw new ForbiddenError("Diretoria de ensino fora do escopo do administrador");
  }

  const school = await schoolUnitModel.create(null, {
    diretoriaEnsinoId: departmentId,
    nome: String(body.nome || "").trim(),
    codigoInep: body.codigo_inep ? String(body.codigo_inep).trim() : null,
    endereco: String(body.endereco || "").trim(),
    cidade: String(body.cidade || "").trim(),
  });

  return { escola: mapSchool(school) };
}

async function lookupPostalCode(cep) {
  try {
    const response = await fetch(
      `https://viacep.com.br/ws/${cep}/json/`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok) {
      throw new Error("CEP provider returned an unsuccessful response");
    }

    const result = await response.json();
    if (result.erro) return { found: false };
    return {
      found: true,
      data: {
        cep: result.cep,
        logradouro: result.logradouro || "",
        bairro: result.bairro || "",
        cidade: result.localidade || "",
        uf: result.uf || "",
      },
    };
  } catch (_error) {
    throw new AppError("Servico de consulta de CEP indisponivel", {
      statusCode: 502,
      code: "POSTAL_CODE_LOOKUP_UNAVAILABLE",
    });
  }
}

module.exports = {
  getSchoolManagement,
  createSchool,
  lookupPostalCode,
};