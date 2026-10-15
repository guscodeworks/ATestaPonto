"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError } = require("../utils/errors");

async function listCargos() {
  let response;
  let body;
  try {
    response = await requestSpring("/internal/cargos", { method: "GET" });
    const raw = await response.text();
    body = raw ? JSON.parse(raw) : null;
  } catch (_error) {
    throw new AppError("Servico de cargos indisponivel", {
      statusCode: 502,
      code: "CARGO_READ_SERVICE_UNAVAILABLE",
    });
  }

  if (response.status !== 200 || !Array.isArray(body)) {
    throw new AppError("Resposta invalida do servico de cargos", {
      statusCode: 502,
      code: "CARGO_READ_SERVICE_UNAVAILABLE",
    });
  }

  return body.map((cargo) => {
    if (!cargo || !Number.isSafeInteger(cargo.id) || cargo.id < 1
        || typeof cargo.cargo !== "string" || typeof cargo.ativo !== "boolean") {
      throw new AppError("Resposta invalida do servico de cargos", {
        statusCode: 502,
        code: "CARGO_READ_SERVICE_UNAVAILABLE",
      });
    }
    return { id: cargo.id, cargo: cargo.cargo, ativo: cargo.ativo };
  });
}

module.exports = { listCargos };
