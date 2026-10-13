const { createClient } = require("redis");
const env = require("./env");

const SAFE_PREFIX_SEGMENT = /^[a-z][a-z_-]*$/;
const REDIS_REQUEST_TIMEOUT_MS = 2000;

const redisClient = env.REDIS_ENABLED
  ? createClient({
      socket: {
        host: env.REDIS_HOST || "127.0.0.1",
        port: env.REDIS_PORT || 6379,
        connectTimeout: REDIS_REQUEST_TIMEOUT_MS,
      },
    })
  : null;

if (redisClient) {
  redisClient.on("error", (error) => {
    console.error("[Redis] Erro:", error.message);
  });

  redisClient.connect().catch((error) => {
    console.error("[Redis] Falha ao conectar:", error.message);
  });
}

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

  return `${env.REDIS_NAMESPACE}:${safeSegments.join(":")}:`;
}

module.exports = {
  buildRedisKeyPrefix,
  getRedisClient,
};
