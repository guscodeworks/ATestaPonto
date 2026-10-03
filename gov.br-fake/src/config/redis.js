"use strict";

const { createClient } = require("redis");
const { env } = require("./env");

const SAFE_PREFIX_SEGMENT = /^[a-z][a-z_-]*$/;

const redisClient = env.redisEnabled
  ? createClient({
      socket: {
        host: env.redisHost || "127.0.0.1",
        port: Number(env.redisPort || 6379),
        connectTimeout: 2000,
      },
    })
  : null;

if (redisClient) {
  redisClient.on("error", (error) => {
    console.error("[REDIS] Erro:", error.message);
  });
}

let redisConnectionPromise = null;

async function ensureRedisConnection() {
  if (!redisClient) {
    throw new Error(
      "Redis client requested while REDIS_ENABLED=false. Check the caller configuration."
    );
  }

  if (!redisClient.isOpen) {
    if (!redisConnectionPromise) {
      redisConnectionPromise = redisClient.connect().finally(() => {
        redisConnectionPromise = null;
      });
    }

    await redisConnectionPromise;
  }

  return redisClient;
}

function getRedisClient() {
  if (!redisClient) {
    throw new Error(
      "Redis client requested while REDIS_ENABLED=false. Check the caller configuration."
    );
  }

  return {
    get: async (key) => {
      const client = await ensureRedisConnection();
      return client.get(key);
    },

    set: async (key, value, options = {}) => {
      const client = await ensureRedisConnection();

      const args = {};

      if (options.px !== undefined) {
        args.PX = Number(options.px);
      }

      return client.set(key, value, args);
    },

    del: async (key) => {
      const client = await ensureRedisConnection();
      return client.del(key);
    },

    getdel: async (key) => {
      const client = await ensureRedisConnection();
      return client.getDel(key);
    },

    ping: async () => {
      const client = await ensureRedisConnection();
      return client.ping();
    },

    eval: async (script, keys, args) => {
      const client = await ensureRedisConnection();

      return client.eval(script, {
        keys,
        arguments: args,
      });
    },
  };
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

  return `${env.redisNamespace}:${safeSegments.join(":")}:`;
}

module.exports = {
  buildRedisKeyPrefix,
  getRedisClient,
};
