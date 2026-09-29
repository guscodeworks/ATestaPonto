"use strict";

const crypto = require("crypto");
const session = require("express-session");
const env = require("./env");
const { buildRedisKeyPrefix, getRedisClient } = require("./redis");

const SESSION_KEY_PREFIX = buildRedisKeyPrefix("ponto", "session");
const CONSUME_PASSWORD_RECOVERY_SCRIPT = `
  local value = redis.call('GET', KEYS[1])
  if not value then return 0 end

  local sessionData = cjson.decode(value)
  local recovery = sessionData['passwordRecovery']
  if type(recovery) ~= 'table' or recovery['verified'] ~= true then return 0 end
  if tostring(recovery['authorizationId'] or '') ~= ARGV[1] then return 0 end
  if tostring(recovery['employeeId'] or '') ~= ARGV[2] then return 0 end

  local expiresAt = tonumber(recovery['expiresAt'])
  if not expiresAt or tonumber(ARGV[3]) > expiresAt then return 0 end

  local ttl = redis.call('PTTL', KEYS[1])
  if ttl <= 0 then return 0 end

  sessionData['passwordRecovery'] = nil
  redis.call('SET', KEYS[1], cjson.encode(sessionData), 'PX', ttl)
  return 1
`;

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

function validateSessionTtlMs(value, maxTtlMs = Number.MAX_SAFE_INTEGER) {
  const ttlMs = Number(value);

  if (
    !Number.isFinite(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > maxTtlMs
  ) {
    throw new RangeError(
      "Session TTL must be positive and must not exceed the store's configured limit."
    );
  }

  return Math.ceil(ttlMs);
}

function getSessionTtlMs(sessionData, maxTtlMs) {
  const cookie = sessionData?.cookie;

  if (cookie?.expires !== undefined && cookie.expires !== null) {
    const expiresAt = new Date(cookie.expires).getTime();
    return validateSessionTtlMs(expiresAt - Date.now(), maxTtlMs);
  }

  const configuredMaxAge = cookie?.maxAge ?? cookie?.originalMaxAge;
  if (configuredMaxAge !== undefined && configuredMaxAge !== null) {
    return validateSessionTtlMs(configuredMaxAge, maxTtlMs);
  }

  return maxTtlMs;
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

function validateRecoveryConsumption({ authorizationId, employeeId } = {}) {
  const safeEmployeeId = Number(employeeId);
  if (
    typeof authorizationId !== "string" ||
    !/^[a-f0-9]{64}$/.test(authorizationId) ||
    !Number.isSafeInteger(safeEmployeeId) ||
    safeEmployeeId <= 0
  ) {
    throw new TypeError("Invalid password recovery consumption data.");
  }

  return { authorizationId, employeeId: safeEmployeeId };
}

function matchesVerifiedRecovery(sessionData, expected, now = Date.now()) {
  const recovery = sessionData?.passwordRecovery;
  return Boolean(
    recovery &&
    recovery.verified === true &&
    recovery.authorizationId === expected.authorizationId &&
    Number(recovery.employeeId) === expected.employeeId &&
    now <= Number(recovery.expiresAt)
  );
}

class RecoveryMemorySessionStore extends session.MemoryStore {
  consumePasswordRecovery(sid, expectedRecovery, callback) {
    const done = createOnceCallback(callback);

    try {
      const expected = validateRecoveryConsumption(expectedRecovery);
      const serializedSession = this.sessions[sid];
      if (!serializedSession) {
        done(null, false);
        return;
      }

      const sessionData = JSON.parse(serializedSession);
      if (!matchesVerifiedRecovery(sessionData, expected)) {
        done(null, false);
        return;
      }

      delete sessionData.passwordRecovery;
      this.sessions[sid] = JSON.stringify(sessionData);
      done(null, true);
    } catch (error) {
      done(error);
    }
  }
}

class RedisSessionStore extends session.Store {
  constructor({ maxTtlMs = env.ADMIN_SESSION_TTL_MS } = {}) {
    super();
    // ADMIN conserva o teto original; os demais fluxos informam o seu próprio.
    this.maxTtlMs = validateSessionTtlMs(maxTtlMs);
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
      const ttlMs = getSessionTtlMs(sessionData, this.maxTtlMs);

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

  async consumePasswordRecovery(sid, expectedRecovery, callback) {
    const done = createOnceCallback(callback);

    try {
      const expected = validateRecoveryConsumption(expectedRecovery);
      const consumed = await this.client.eval(
        CONSUME_PASSWORD_RECOVERY_SCRIPT,
        [buildSessionKey(sid)],
        [
          expected.authorizationId,
          String(expected.employeeId),
          String(Date.now()),
        ]
      );
      done(null, Number(consumed) === 1);
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

module.exports = { RecoveryMemorySessionStore, RedisSessionStore };
