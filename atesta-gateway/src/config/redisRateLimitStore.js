"use strict";

const { randomUUID } = require("node:crypto");
const env = require("./env");
const { getRedisClient, buildRedisKeyPrefix } = require("./redis");

const MEMORY_CLEANUP_INTERVAL_MS = 60 * 1000;
const memoryEntries = new Map();
let nextMemoryCleanupAt = 0;

function buildRateLimitKey(name, digest) {
  return `${buildRedisKeyPrefix("ponto", "rate_limit", name)}${digest}`;
}

function cleanupExpiredMemoryEntries(now) {
  if (now < nextMemoryCleanupAt) {
    return;
  }

  for (const [key, entry] of memoryEntries) {
    if (entry.expiresAt <= now) {
      memoryEntries.delete(key);
    }
  }
  nextMemoryCleanupAt = now + MEMORY_CLEANUP_INTERVAL_MS;
}

function getActiveMemoryEntry(key, now) {
  const entry = memoryEntries.get(key);
  if (!entry || entry.expiresAt <= now) {
    if (entry) {
      memoryEntries.delete(key);
    }
    return null;
  }

  return entry;
}

async function readMemory(name, digest) {
  const now = Date.now();
  cleanupExpiredMemoryEntries(now);
  const entry = getActiveMemoryEntry(buildRateLimitKey(name, digest), now);

  return entry
    ? { hits: entry.hits, ttl: Math.max(0, entry.expiresAt - now) }
    : { hits: 0, ttl: 0 };
}

async function incrementMemory(name, digest, windowMs) {
  const now = Date.now();
  cleanupExpiredMemoryEntries(now);
  const key = buildRateLimitKey(name, digest);
  let entry = getActiveMemoryEntry(key, now);

  if (!entry) {
    entry = {
      hits: 0,
      expiresAt: now + windowMs,
      generation: randomUUID(),
    };
    memoryEntries.set(key, entry);
  }

  entry.hits += 1;
  return {
    key,
    hits: entry.hits,
    ttl: Math.max(0, entry.expiresAt - now),
    generation: entry.generation,
  };
}

async function refundMemory({ key, generation }) {
  if (typeof key !== "string" || typeof generation !== "string") {
    throw new TypeError("Invalid in-memory rate limit reservation");
  }

  const now = Date.now();
  cleanupExpiredMemoryEntries(now);
  const entry = getActiveMemoryEntry(key, now);

  if (entry && entry.generation === generation && entry.hits > 0) {
    entry.hits -= 1;
  }
}

// Contador, geração e TTL são modificados no mesmo comando em todas as instâncias.
const INCREMENT_SCRIPT = `
local key = KEYS[1]
if redis.call('EXISTS', key) == 0 then
  local now = redis.call('TIME')
  redis.call('HSET', key, 'hits', 0, 'generation', now[1] .. ':' .. now[2])
end
if redis.call('PTTL', key) < 0 then
  redis.call('PEXPIRE', key, ARGV[1])
end
local hits = redis.call('HINCRBY', key, 'hits', 1)
return {hits, redis.call('PTTL', key), redis.call('HGET', key, 'generation')}
`;

// Resposta tardia não desconta tentativas da janela seguinte nem recria chave expirada.
const REFUND_SCRIPT = `
if redis.call('HGET', KEYS[1], 'generation') == ARGV[1] then
  local hits = tonumber(redis.call('HGET', KEYS[1], 'hits') or '0')
  if hits > 0 then redis.call('HINCRBY', KEYS[1], 'hits', -1) end
end
return 1
`;

const READ_SCRIPT = `
local hits = tonumber(redis.call('HGET', KEYS[1], 'hits') or '0')
local ttl = redis.call('PTTL', KEYS[1])
if ttl == -1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, math.max(0, ttl)}
`;

async function readRedis(name, digest, windowMs) {
  const key = buildRateLimitKey(name, digest);
  const [hits, ttl] = await getRedisClient().eval(READ_SCRIPT, { keys: [key], arguments: [String(windowMs)] });
  if (!Number.isSafeInteger(Number(hits)) || Number(hits) < 0 ||
      !Number.isFinite(Number(ttl)) || Number(ttl) < 0) throw new Error("Invalid Redis rate limit state");
  return { hits: Number(hits), ttl: Number(ttl) };
}

async function incrementRedis(name, digest, windowMs) {
  const key = buildRateLimitKey(name, digest);
  const [hits, ttl, generation] = await getRedisClient().eval(INCREMENT_SCRIPT, { keys: [key], arguments: [String(windowMs)] });
  if (!Number.isSafeInteger(Number(hits)) || Number(hits) < 1 ||
      !Number.isFinite(Number(ttl)) || Number(ttl) < 0 || typeof generation !== "string") {
    throw new Error("Invalid Redis rate limit state");
  }
  return { key, hits: Number(hits), ttl: Number(ttl), generation };
}

async function refundRedis({ key, generation }) {
  await getRedisClient().eval(REFUND_SCRIPT, { keys: [key], arguments: [generation] });
}

const memoryStore = {
  increment: incrementMemory,
  refund: refundMemory,
  read: readMemory,
};
const redisStore = {
  increment: incrementRedis,
  refund: refundRedis,
  read: readRedis,
};

// Memória é permitida somente no desenvolvimento local. Produção já rejeita
// REDIS_ENABLED=false na validação do ambiente e nunca faz fallback após falha.
module.exports = !env.IS_PRODUCTION && !env.REDIS_ENABLED
  ? memoryStore
  : redisStore;
