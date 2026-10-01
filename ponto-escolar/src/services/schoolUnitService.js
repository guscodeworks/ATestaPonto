"use strict";

const schoolUnitModel = require("../models/schoolUnitModel");
const educationDepartmentModel = require("../models/educationDepartmentModel");
const cepService = require("./cepService");
const { BadRequestError, ForbiddenError, NotFoundError } = require("../utils/errors");

function resolveAdminScope(acessos) {
  const list = Array.isArray(acessos) ? acessos : [];
  const isSeduc = list.some((item) => item?.perfil === "ADMIN_SEDUC");
  const diretorias = new Set(
    list
      .filter((item) => item?.perfil === "ADMIN_DIRETORIA")
      .map((item) => Number(item.diretoria_ensino_id))
      .filter((id) => Number.isSafeInteger(id) && id > 0)
  );
  if (!isSeduc && diretorias.size === 0) {
    throw new ForbiddenError("Perfil sem permissao para gerenciar escolas");
  }
  return { isSeduc, diretorias };
}

function parseAtiva(value) {
  if (value === undefined || value === "") return undefined;
  if ([true, 1, "1", "true"].includes(value)) return true;
  if ([false, 0, "0", "false"].includes(value)) return false;
  throw new BadRequestError("Filtro ativa invalido");
}

function mapSchool(school) {
  return {
    ...school,
    id: Number(school.id),
    diretoria_ensino_id: Number(school.diretoria_ensino_id),
    latitude: Number(school.latitude),
    longitude: Number(school.longitude),
    raio_permitido_metros: Number(school.raio_permitido_metros),
    ativa: Boolean(school.ativa),
  };
}

async function listSchools(query = {}, acessos) {
  const scope = resolveAdminScope(acessos);
  const ativa = parseAtiva(query.ativa);
  let requestedDre;
  if (query.diretoria_ensino_id !== undefined) {
    requestedDre = Number(query.diretoria_ensino_id);
    if (!Number.isSafeInteger(requestedDre) || requestedDre < 1) {
      throw new BadRequestError("diretoria_ensino_id invalido");
    }
    if (!scope.isSeduc && !scope.diretorias.has(requestedDre)) {
      throw new ForbiddenError("Diretoria fora do escopo do administrador");
    }
  }

  let schools;
  if (scope.isSeduc) {
    schools = requestedDre
      ? await schoolUnitModel.findByDiretoriaId(requestedDre, { ativa })
      : await schoolUnitModel.list({ ativa });
  } else {
    const ids = requestedDre ? [requestedDre] : [...scope.diretorias];
    schools = await schoolUnitModel.listByDiretoriaIds(ids, { ativa });
  }
  return schools.map(mapSchool);
}

function requiredText(value, field, maxLength) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw new BadRequestError(`${field} obrigatorio ou invalido`);
  }
  return text;
}

function requiredNumber(value, field, min, max) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new BadRequestError(`${field} obrigatoria`);
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new BadRequestError(`${field} invalida`);
  }
  return number;
}

function hasValue(value) {
  return value !== undefined && value !== null &&
    (typeof value !== "string" || value.trim() !== "");
}

function valueOrSuggestion(value, suggestion) {
  return hasValue(value) ? value : suggestion;
}

async function resolveCepSuggestion(body) {
  if (!hasValue(body.cep)) return null;

  try {
    return await cepService.lookupCep(body.cep);
  } catch (error) {
    const providerUnavailable = [
      "CEP_LOOKUP_TIMEOUT",
      "CEP_SERVICE_UNAVAILABLE",
    ].includes(error.code);
    const manualCoordinates = hasValue(body.latitude) && hasValue(body.longitude);

    // Com coordenadas manuais válidas, a indisponibilidade externa não impede
    // o cadastro. CEP inválido ou não encontrado continua sendo rejeitado.
    if (providerUnavailable && manualCoordinates) return null;
    throw error;
  }
}

async function lookupSchoolAddress(cep) {
  return cepService.lookupCep(cep);
}

async function createSchool(body = {}, acessos) {
  const scope = resolveAdminScope(acessos);
  const dreId = Number(body.diretoria_ensino_id);
  if (!Number.isSafeInteger(dreId) || dreId < 1) {
    throw new BadRequestError("diretoria_ensino_id obrigatoria e valida");
  }
  if (!scope.isSeduc && !scope.diretorias.has(dreId)) {
    throw new ForbiddenError("Cadastro permitido somente na propria DRE");
  }

  const dre = await educationDepartmentModel.findById(dreId);
  if (!dre) throw new NotFoundError("Diretoria de ensino nao encontrada");

  const cepSuggestion = await resolveCepSuggestion(body);
  const latitude = requiredNumber(
    valueOrSuggestion(body.latitude, cepSuggestion?.latitude),
    "latitude",
    -90,
    90
  );
  const longitude = requiredNumber(
    valueOrSuggestion(body.longitude, cepSuggestion?.longitude),
    "longitude",
    -180,
    180
  );
  const radius = body.raio_permitido_metros === undefined
    ? 100
    : Number(body.raio_permitido_metros);
  if (!Number.isSafeInteger(radius) || radius <= 0) {
    throw new BadRequestError("raio_permitido_metros invalido");
  }
  if (body.ativa !== undefined && typeof body.ativa !== "boolean") {
    throw new BadRequestError("ativa deve ser booleano");
  }

  const school = {
    diretoria_ensino_id: dreId,
    nome: requiredText(body.nome, "nome", 150),
    latitude,
    longitude,
    raio_permitido_metros: radius,
    ativa: body.ativa !== false,
    codigo_inep: body.codigo_inep == null || body.codigo_inep === ""
      ? null
      : requiredText(body.codigo_inep, "codigo_inep", 20),
    endereco: !hasValue(valueOrSuggestion(body.endereco, cepSuggestion?.endereco))
      ? null
      : requiredText(valueOrSuggestion(body.endereco, cepSuggestion?.endereco), "endereco", 255),
    cidade: !hasValue(valueOrSuggestion(body.cidade, cepSuggestion?.cidade))
      ? "Campinas"
      : requiredText(valueOrSuggestion(body.cidade, cepSuggestion?.cidade), "cidade", 100),
  };
  const result = await schoolUnitModel.create(null, school);
  const created = await schoolUnitModel.findById(Number(result.insertId));
  return mapSchool(created);
}

module.exports = { listSchools, lookupSchoolAddress, createSchool };
