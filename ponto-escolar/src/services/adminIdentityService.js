"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError, BadRequestError } = require("../utils/errors");
const { CAPACIDADES_POR_PERFIL } = require("../utils/adminCapabilities");

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isId = value => Number.isSafeInteger(value) && value > 0;
const isNullableId = value => value === null || isId(value);
const isDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const isTimestamp = value => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}Z`))
  && new Date(`${value}Z`).toISOString() === `${value}.000Z`;

function isAccess(access, adminId) {
  if (!isObject(access) || !isId(access.id) || access.usuario_administrativo_id !== adminId
      || typeof access.perfil !== "string" || !Object.hasOwn(CAPACIDADES_POR_PERFIL, access.perfil)
      || access.status !== "ATIVO" || !isNullableId(access.diretoria_ensino_id)
      || !isNullableId(access.unidade_escolar_id) || !isNullableId(access.concedido_por_acesso_id)
      || !(access.data_inicio === null || isDate(access.data_inicio))
      || !(access.data_fim === null || isDate(access.data_fim))
      || (access.data_inicio !== null && access.data_fim !== null && access.data_inicio > access.data_fim)
      || !isTimestamp(access.criado_em) || !isTimestamp(access.atualizado_em)) return false;

  // Valida o formato territorial do contrato; nao concede capacidades ou amplia escopo.
  if (access.perfil === "ADMIN_SEDUC") {
    return access.diretoria_ensino_id === null && access.unidade_escolar_id === null;
  }
  if (access.perfil === "ADMIN_DIRETORIA") {
    return isId(access.diretoria_ensino_id) && access.unidade_escolar_id === null;
  }
  return access.diretoria_ensino_id === null && isId(access.unidade_escolar_id);
}

// Preserva Date e timezone Z usados pelo pool mysql2 no contrato dos middlewares.
const timestamp = value => value === null ? null : new Date(`${value}Z`);
const date = value => value === null ? null : new Date(`${value}T00:00:00Z`);

async function readAdminIdentity(adminId) {
  if (!isId(adminId)) throw new BadRequestError("Identificador administrativo invalido");
  const id = adminId;

  try {
    const response = await requestSpring("/internal/auth/admin/context", {
      method: "POST",
      body: { admin_id: id },
    });
    if (!response.ok) throw new Error("Leitura administrativa indisponivel");
    const result = await response.json();
    if (!isObject(result) || !Array.isArray(result.acessos)) throw new Error("Contrato invalido");
    if (result.admin === null && result.acessos.length === 0) return { admin: null, acessos: [] };

    const admin = result.admin;
    if (!isObject(admin) || admin.id !== id || typeof admin.ativo !== "boolean"
        || typeof admin.nome !== "string" || !(admin.email === null || typeof admin.email === "string")
        || !(admin.ultimo_login_em === null || isTimestamp(admin.ultimo_login_em))
        || !isTimestamp(admin.criado_em) || !isTimestamp(admin.atualizado_em)
        || (!admin.ativo && result.acessos.length !== 0)
        || !result.acessos.every(access => isAccess(access, id))
        || new Set(result.acessos.map(access => access.id)).size !== result.acessos.length) {
      throw new Error("Contrato invalido");
    }

    return {
      admin: {
        id: admin.id, nome: admin.nome, email: admin.email, ativo: admin.ativo ? 1 : 0,
        ultimo_login_em: timestamp(admin.ultimo_login_em),
        criado_em: timestamp(admin.criado_em), atualizado_em: timestamp(admin.atualizado_em),
      },
      acessos: result.acessos.map(access => ({
        id: access.id, usuario_administrativo_id: access.usuario_administrativo_id,
        perfil: access.perfil, diretoria_ensino_id: access.diretoria_ensino_id,
        unidade_escolar_id: access.unidade_escolar_id, status: access.status,
        data_inicio: date(access.data_inicio), data_fim: date(access.data_fim),
        concedido_por_acesso_id: access.concedido_por_acesso_id,
        criado_em: timestamp(access.criado_em), atualizado_em: timestamp(access.atualizado_em),
      })),
    };
  } catch {
    // Sem fallback local ou cache: os middlewares existentes negam acesso em qualquer falha.
    throw new AppError("Servico de identidade administrativa indisponivel", {
      statusCode: 502, code: "ADMIN_IDENTITY_SERVICE_UNAVAILABLE",
    });
  }
}

module.exports = { readAdminIdentity };
