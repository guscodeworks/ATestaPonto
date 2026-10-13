"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError } = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");

async function postSchool(path, body) {
  try {
    const response = await requestSpring(path, {
      method: "POST",
      body,
    });
    return { status: response.status, body: await response.json() };
  } catch (_error) {
    throw new AppError("Servico de escolas indisponivel", {
      statusCode: 502,
      code: "SCHOOL_SERVICE_UNAVAILABLE",
    });
  }
}

function previewSchool(body) {
  return postSchool("/internal/escolas/preview", body);
}

async function createSchool(body, contexto = {}) {
  const result = await postSchool("/internal/escolas", body);
  if (result.status === 201) {
    try {
      await registerAuditLog({
        evento: "escola_criada",
        mensagem: "Escola cadastrada",
        adminId: contexto.adminId,
        ipOrigem: contexto.ipOrigem,
        metadados: {
          escolaId: result.body?.id,
          diretoriaEnsinoId: result.body?.diretoria_ensino_id,
          cepVerificado: true,
          origemCoordenadas: "BRASILAPI",
        },
      });
    } catch (_error) {
      // Mesmo uma falha no logger de erro da auditoria não desfaz o sucesso do Spring.
    }
  }
  return result;
}

module.exports = { previewSchool, createSchool };
