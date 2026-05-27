const dotenv = require("dotenv");

dotenv.config({ quiet: true });

const WEAK_JWT_SECRETS = new Set([
  "secret",
  "changeme",
  "jwtsecret",
  "jwt_secret",
  "password",
  "123456",
  "admin",
  "test",
  "default",
]);

function throwEnvError(message) {
  const error = new Error(`Invalid environment configuration: ${message}`);
  error.name = "EnvValidationError";
  throw error;
}

function getRequiredVar(name, fallbackValue) {
  const raw = process.env[name] ?? fallbackValue;
  if (typeof raw !== "string" || raw.trim() === "") {
    throwEnvError(`"${name}" is required`);
  }
  return raw.trim();
}

function parseInteger(value, name, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throwEnvError(`"${name}" must be an integer`);
  }
  if (typeof min === "number" && parsed < min) {
    throwEnvError(`"${name}" must be >= ${min}`);
  }
  if (typeof max === "number" && parsed > max) {
    throwEnvError(`"${name}" must be <= ${max}`);
  }
  return parsed;
}

function parseFloatValue(value, name, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throwEnvError(`"${name}" must be a valid number`);
  }
  if (typeof min === "number" && parsed < min) {
    throwEnvError(`"${name}" must be >= ${min}`);
  }
  if (typeof max === "number" && parsed > max) {
    throwEnvError(`"${name}" must be <= ${max}`);
  }
  return parsed;
}

function hasStrongEntropy(secret) {
  const hasLower = /[a-z]/.test(secret);
  const hasUpper = /[A-Z]/.test(secret);
  const hasNumber = /[0-9]/.test(secret);
  const hasSpecial = /[^A-Za-z0-9]/.test(secret);
  const categories = [hasLower, hasUpper, hasNumber, hasSpecial].filter(
    Boolean
  ).length;
  return categories >= 3;
}

function validateJwtSecret(secret) {
  const normalized = secret.trim();
  if (normalized.length < 32) {
    throwEnvError('"JWT_SECRET" must be at least 32 characters');
  }
  if (WEAK_JWT_SECRETS.has(normalized.toLowerCase())) {
    throwEnvError('"JWT_SECRET" is too weak');
  }
  if (!hasStrongEntropy(normalized)) {
    throwEnvError('"JWT_SECRET" must include mixed character types');
  }
  return normalized;
}

function validateJwtExpiresIn(value) {
  const normalized = value.trim();
  if (!/^\d+[smhd]$/.test(normalized) && !/^\d+$/.test(normalized)) {
    throwEnvError(
      '"JWT_EXPIRES_IN" must be a number of seconds or format like 15m/8h/7d'
    );
  }
  return normalized;
}

function validateCorsOrigins(rawOrigins, isProduction) {
  const origins = rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throwEnvError('"CORS_ORIGIN" must include at least one origin');
  }

  if (isProduction && origins.includes("*")) {
    throwEnvError('"CORS_ORIGIN" cannot contain "*" in production');
  }

  origins.forEach((origin) => {
    if (origin === "*") {
      return;
    }
    try {
      // eslint-disable-next-line no-new
      new URL(origin);
    } catch (_error) {
      throwEnvError(`"${origin}" in CORS_ORIGIN is not a valid URL`);
    }
  });

  return origins;
}

const NODE_ENV = (process.env.NODE_ENV || "development").trim().toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production";

const dbPassword = process.env.DB_PASSWORD ?? process.env.DB_PASS;
const dbName = process.env.DB_NAME ?? process.env.DB;
const schoolLatitude = parseFloatValue(
  getRequiredVar("SCHOOL_LATITUDE", process.env.SCHOOL_LATITUDE),
  "SCHOOL_LATITUDE",
  -90,
  90
);
const schoolLongitude = parseFloatValue(
  getRequiredVar("SCHOOL_LONGITUDE", process.env.SCHOOL_LONGITUDE),
  "SCHOOL_LONGITUDE",
  -180,
  180
);

const env = {
  NODE_ENV,
  IS_PRODUCTION,
  PORT: parseInteger(getRequiredVar("PORT"), "PORT", 1, 65535),
  DB_HOST: getRequiredVar("DB_HOST"),
  DB_PORT: parseInteger(process.env.DB_PORT || "3306", "DB_PORT", 1, 65535),
  DB_USER: getRequiredVar("DB_USER"),
  DB_PASSWORD: IS_PRODUCTION
    ? getRequiredVar("DB_PASSWORD", dbPassword)
    : typeof dbPassword === "string"
    ? dbPassword
    : "",
  DB_NAME: getRequiredVar("DB_NAME", dbName),
  DB_CONNECTION_LIMIT: parseInteger(
    process.env.DB_CONNECTION_LIMIT || "10",
    "DB_CONNECTION_LIMIT",
    1,
    100
  ),
  JWT_SECRET: validateJwtSecret(getRequiredVar("JWT_SECRET")),
  JWT_EXPIRES_IN: validateJwtExpiresIn(getRequiredVar("JWT_EXPIRES_IN")),
  FUNCIONARIO_JWT_EXPIRES_IN: validateJwtExpiresIn(
    process.env.FUNCIONARIO_JWT_EXPIRES_IN || "20m"
  ),
  SESSION_SECRET: getRequiredVar("SESSION_SECRET"),
  SCHOOL_LATITUDE: schoolLatitude,
  SCHOOL_LONGITUDE: schoolLongitude,
  SCHOOL_UNIT_CODE: (process.env.SCHOOL_UNIT_CODE || "DEFAULT").trim(),
  COMPANY_LATITUDE: schoolLatitude,
  COMPANY_LONGITUDE: schoolLongitude,
  ALLOWED_RADIUS_METERS: parseFloatValue(
    getRequiredVar("ALLOWED_RADIUS_METERS"),
    "ALLOWED_RADIUS_METERS",
    1,
    10000
  ),
  POINT_RATE_LIMIT_WINDOW_MS: parseInteger(
    process.env.POINT_RATE_LIMIT_WINDOW_MS || String(5 * 60 * 1000),
    "POINT_RATE_LIMIT_WINDOW_MS",
    1000,
    60 * 60 * 1000
  ),
  POINT_RATE_LIMIT_MAX: parseInteger(
    process.env.POINT_RATE_LIMIT_MAX || "500",
    "POINT_RATE_LIMIT_MAX",
    1,
    10000
  ),
  CORS_ORIGINS: validateCorsOrigins(
    getRequiredVar("CORS_ORIGIN"),
    IS_PRODUCTION
  ),
};

module.exports = Object.freeze(env);
