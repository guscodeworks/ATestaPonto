"use strict";

const dotenv = require("dotenv");

dotenv.config({ quiet: true });

const DEFAULT_PORT = "4000";
const DEFAULT_HOST = "127.0.0.1" || "0.0.0.0";

function throwEnvError(message) {
  const error = new Error(
    `Invalid gov.br-fake environment configuration: ${message}`
  );
  error.name = "EnvValidationError";
  throw error;
}

function getOptionalVar(name, fallbackValue = "") {
  return String(process.env[name] ?? fallbackValue).trim();
}

function parseBoolean(value, name) {
  const normalized = String(value).trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throwEnvError(`"${name}" must be "true" or "false"`);
}

function validateUrl(name, value) {
  let url;

  try {
    url = new URL(value);
  } catch (_error) {
    throwEnvError(`"${name}" must be a valid URL`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throwEnvError(`"${name}" must use HTTP or HTTPS`);
  }

  return url.toString();
}

function validateRedisNamespace(value) {
  if (value.length > 128) {
    throwEnvError('"REDIS_NAMESPACE" must have at most 128 characters');
  }

  const segments = value.split(":");
  const isValid = segments.every((segment) =>
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(segment)
  );

  if (!isValid) {
    throwEnvError(
      '"REDIS_NAMESPACE" must contain only letters, numbers, "_", "-" and ":" between non-empty segments'
    );
  }

  return value;
}

function parsePort(value) {
  const raw = String(value || DEFAULT_PORT).trim();
  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid gov.br-fake PORT configuration.");
  }

  return port;
}

const nodeEnv = getOptionalVar("NODE_ENV", "development").toLowerCase();
const isProduction = nodeEnv === "production";
const redisEnabled = parseBoolean(
  getOptionalVar("REDIS_ENABLED", "false"),
  "REDIS_ENABLED"
);
const redisNamespace = validateRedisNamespace(
  getOptionalVar(
    "REDIS_NAMESPACE",
    isProduction ? "atestaponto:production" : "atestaponto:local"
  )
);
const upstashRedisRestUrlRaw = getOptionalVar("UPSTASH_REDIS_REST_URL");
const upstashRedisRestToken = getOptionalVar("UPSTASH_REDIS_REST_TOKEN");

if (isProduction && !redisEnabled) {
  throwEnvError('"REDIS_ENABLED" must be "true" in production');
}

if (redisEnabled && !upstashRedisRestUrlRaw) {
  throwEnvError(
    '"UPSTASH_REDIS_REST_URL" is required when REDIS_ENABLED=true'
  );
}

if (redisEnabled && !upstashRedisRestToken) {
  throwEnvError(
    '"UPSTASH_REDIS_REST_TOKEN" is required when REDIS_ENABLED=true'
  );
}

const upstashRedisRestUrl = redisEnabled
  ? validateUrl("UPSTASH_REDIS_REST_URL", upstashRedisRestUrlRaw)
  : "";

const fakeAdminLogin = getOptionalVar("GOVBR_FAKE_ADMIN_LOGIN");
const fakeAdminPassword = getOptionalVar("GOVBR_FAKE_ADMIN_PASSWORD");

if (fakeAdminLogin !== "adminlocal") {
  throwEnvError('"GOVBR_FAKE_ADMIN_LOGIN" must be "adminlocal"');
}

if (
  fakeAdminPassword.length < 12 ||
  fakeAdminPassword === "replace-with-demo-password"
) {
  throwEnvError(
    '"GOVBR_FAKE_ADMIN_PASSWORD" must be replaced with a demo password of at least 12 characters'
  );
}

// Configuracao do servidor mock/fake do Gov.br, usado apenas em ambiente local
// de desenvolvimento para simular o fluxo OAuth sem depender da integracao real
// (ver "environmentLabel" abaixo, que sinaliza explicitamente esse proposito).
const env = Object.freeze({
  nodeEnv,
  isProduction,
  redisEnabled,
  redisNamespace,
  upstashRedisRestUrl,
  upstashRedisRestToken: redisEnabled ? upstashRedisRestToken : "",
  host: process.env.HOST || DEFAULT_HOST,
  // Aceita GOVBR_FAKE_PORT ou PORT como fallback, permitindo reaproveitar a
  // mesma variavel de ambiente PORT em plataformas de deploy que a definem
  // automaticamente.
  port: parsePort(process.env.GOVBR_FAKE_PORT || process.env.PORT),
  environmentLabel: "local-demonstrativo",
  clientId: String(process.env.GOVBR_FAKE_CLIENT_ID || "ponto-escolar").trim(),
  clientSecret: String(
    process.env.GOVBR_FAKE_CLIENT_SECRET || "dev-secret"
  ).trim(),
  // URLs da aplicacao principal (ponto-escolar) para onde o fake Gov.br deve
  // redirecionar apos o "login", simulando o comportamento do provedor real.
  pontoEscolarRedirectUri: String(
    process.env.PONTO_ESCOLAR_REDIRECT_URI ||
      "http://127.0.0.1:3000/auth/govbr/callback"
  ).trim(),
  pontoEscolarStartUrl: String(
    process.env.PONTO_ESCOLAR_START_URL ||
      "http://127.0.0.1:3000/auth/govbr/login"
  ).trim(),
  // Identidade fixa retornada pelo fake para simular um admin autenticado,
  // usada nas verificacoes de allowlist (adminSubs/adminEmails) do servico real.
  fakeAdminSub: String(
    process.env.GOVBR_FAKE_ADMIN_SUB || "admin-local-001"
  ).trim(),
  fakeAdminName: String(
    process.env.GOVBR_FAKE_ADMIN_NAME || "Administrador Local"
  ).trim(),
  fakeAdminEmail: String(
    process.env.GOVBR_FAKE_ADMIN_EMAIL || "admin@ponto-escolar.local"
  ).trim(),
  fakeAdminLogin,
  fakeAdminPassword,
  fakeSessionTtlMs: 2 * 60 * 60 * 1000,
  authCodeTtlMs: 5 * 60 * 1000,
  accessTokenTtlMs: 60 * 60 * 1000,
  pendingAuthorizeRequestTtlMs: 10 * 60 * 1000,
  cleanupIntervalMs: 60 * 1000,
});

module.exports = {
  env,
};
