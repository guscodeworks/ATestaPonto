"use strict";

const { requestSpring } = require("../integrations/springBackendClient");
const { AppError } = require("../utils/errors");

async function list(ativo) {
  try {
    const query = ativo === undefined
      ? ""
      : `?ativo=${ativo}`;

    const response = await requestSpring(`/internal/diretorias${query}`, {
      method: "GET",
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  } catch (_error) {
    throw new AppError("Servico de diretorias indisponivel", {
      statusCode: 502,
      code: "EDUCATION_DEPARTMENT_SERVICE_UNAVAILABLE",
    });
  }
}

async function findById(id) {
  try {
    const response = await requestSpring(`/internal/diretorias/${id}`, {
      method: "GET",
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  } catch (_error) {
    throw new AppError("Servico de diretorias indisponivel", {
      statusCode: 502,
      code: "EDUCATION_DEPARTMENT_SERVICE_UNAVAILABLE",
    });
  }
}

module.exports = {
  list,
  findById,
};