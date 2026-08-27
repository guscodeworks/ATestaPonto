"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { UnauthorizedError } = require("../utils/errors");

const TOKEN_PURPOSE = "primeira_troca_senha";

// Uma chave derivada separa este comprovante do JWT normal de funcionário.
// Assim, ele não é aceito nem por engano por middlewares que validam JWT_SECRET.
const firstAccessTokenSecret = crypto
  .createHash("sha256")
  .update(`${env.JWT_SECRET}:first-access-password-change:v1`)
  .digest();

function createFirstAccessToken(funcionarioId) {
  return jwt.sign(
    {
      sub: String(funcionarioId),
      purpose: TOKEN_PURPOSE,
    },
    firstAccessTokenSecret,
    {
      algorithm: "HS256",
      expiresIn: env.FIRST_ACCESS_TOKEN_EXPIRES_IN,
    }
  );
}

// Será usado somente pelo endpoint de primeira troca de senha na próxima etapa.
function verifyFirstAccessToken(token) {
  try {
    const payload = jwt.verify(token, firstAccessTokenSecret, {
      algorithms: ["HS256"],
    });
    const funcionarioId = Number(payload.sub);

    if (
      payload.purpose !== TOKEN_PURPOSE ||
      !Number.isInteger(funcionarioId) ||
      funcionarioId < 1
    ) {
      throw new UnauthorizedError("Comprovante de primeiro acesso invalido");
    }

    return { funcionarioId };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError("Comprovante de primeiro acesso invalido");
  }
}

module.exports = {
  TOKEN_PURPOSE,
  createFirstAccessToken,
  verifyFirstAccessToken,
};
