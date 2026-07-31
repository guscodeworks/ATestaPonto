"use strict";

const { Redis } = require("@upstash/redis");
const { env } = require("./env");

const SAFE_PREFIX_SEGMENT = /^[a-z][a-z_-]*$/;

const redisClient = env.redisEnabled
  ? new Redis({
      url: env.upstashRedisRestUrl,
      token: env.upstashRedisRestToken,
    })
  : null;

function getRedisClient() {
  if (!redisClient) {
    throw new Error(
      "Redis client requested while REDIS_ENABLED=false. Check the caller configuration."
    );
  }

  return redisClient;
}

function buildRedisKeyPrefix(...segments) {
  if (segments.length === 0) {
    throw new Error("At least one Redis key prefix segment is required.");
  }

  const safeSegments = segments.map((segment) => {
    if (
      typeof segment !== "string" ||
      segment.length > 48 ||
      !SAFE_PREFIX_SEGMENT.test(segment)
    ) {
      throw new Error(
        "Redis key prefixes accept only non-empty structural segments using lowercase letters, underscores or hyphens."
      );
    }

    return segment;
  });

  // Esta função aceita somente partes estruturais da chave. Identificadores,
  // CPF, e-mail, tokens e cookies deverão ser transformados em hash antes que
  // etapas futuras os anexem ao prefixo retornado.
  return `${env.redisNamespace}:${safeSegments.join(":")}:`;
}

module.exports = {
  buildRedisKeyPrefix,
  getRedisClient,
};
