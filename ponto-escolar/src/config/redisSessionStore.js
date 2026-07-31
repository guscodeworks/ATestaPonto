"use strict";

const crypto = require("crypto");
const session = require("express-session");
const env = require("./env");
const { buildRedisKeyPrefix, getRedisClient } = require("./redis");

const SESSION_KEY_PREFIX = buildRedisKeyPrefix("ponto", "session");

function createOnceCallback(callback) {
  const target = typeof callback === "function" ? callback : () => {};
  let called = false;

  return (...args) => {
    if (called) {
      return;
    }

    called = true;
    target(...args);
  };
}

function buildSessionKey(sid) {
  if (typeof sid !== "string" || sid.length === 0) {
    throw new TypeError("Session ID must be a non-empty string.");
  }

  const sidHash = crypto.createHash("sha256").update(sid).digest("hex");
  return `${SESSION_KEY_PREFIX}${sidHash}`;
}

function validateSessionTtlMs(value) {
  const ttlMs = Number(value);

  if (
    !Number.isFinite(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > env.ADMIN_SESSION_TTL_MS
  ) {
    throw new RangeError(
      "Session TTL must be positive and must not exceed ADMIN_SESSION_TTL_MS."
    );
  }

  return Math.ceil(ttlMs);
}

function getSessionTtlMs(sessionData) {
  const cookie = sessionData?.cookie;

  if (cookie?.expires !== undefined && cookie.expires !== null) {
    const expiresAt = new Date(cookie.expires).getTime();
    return validateSessionTtlMs(expiresAt - Date.now());
  }

  const configuredMaxAge = cookie?.maxAge ?? cookie?.originalMaxAge;
  if (configuredMaxAge !== undefined && configuredMaxAge !== null) {
    return validateSessionTtlMs(configuredMaxAge);
  }

  return validateSessionTtlMs(env.ADMIN_SESSION_TTL_MS);
}

function deserializeSession(value) {
  if (typeof value === "string") {
    return JSON.parse(value);
  }

  if (value && typeof value === "object") {
    return value;
  }

  throw new TypeError("Redis returned invalid session data.");
}

class RedisSessionStore extends session.Store {
  constructor() {
    super();
    this.client = getRedisClient();
  }

  async get(sid, callback) {
    const done = createOnceCallback(callback);

    try {
      const value = await this.client.get(buildSessionKey(sid));

      if (value === null) {
        done(null, null);
        return;
      }

      done(null, deserializeSession(value));
    } catch (error) {
      done(error);
    }
  }

  async set(sid, sessionData, callback) {
    const done = createOnceCallback(callback);

    try {
      const key = buildSessionKey(sid);
      const serializedSession = JSON.stringify(sessionData);
      const ttlMs = getSessionTtlMs(sessionData);

      await this.client.set(key, serializedSession, { px: ttlMs });
      done(null);
    } catch (error) {
      done(error);
    }
  }

  async destroy(sid, callback) {
    const done = createOnceCallback(callback);

    try {
      await this.client.del(buildSessionKey(sid));
      done(null);
    } catch (error) {
      done(error);
    }
  }

  touch(_sid, _sessionData, callback) {
    const done = createOnceCallback(callback);

    // A sessao administrativa usa expiracao absoluta: rolling=false nao
    // renova o cookie no navegador em requisicoes sem alteracao. Renovar o
    // Redis aqui criaria uma sessao no servidor alem da vida util do cookie.
    // O TTL gravado por set permanece como a unica fonte de expiracao.
    done(null);
  }
}

module.exports = { RedisSessionStore };
