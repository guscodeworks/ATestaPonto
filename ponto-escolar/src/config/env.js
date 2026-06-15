const dotenv = require("dotenv");

dotenv.config({ quiet: true });

const DEFAULT_GOVBR_FAKE_BASE_URL = "http://localhost:4000";
const GOVBR_CALLBACK_PATH = "/auth/govbr/callback";
const LEGACY_GOVBR_CALLBACK_PATH = "/admin/auth/callback";

const WEAK_SECRETS = new Set([
  "secret",
  "changeme",
  "change-me",
  "change_me",
  "jwtsecret",
  "jwt_secret",
  "sessionsecret",
  "session_secret",
  "password",
  "123456",
  "admin",
  "test",
  "default",
]);

const WEAK_SESSION_SECRETS = new Set([
  ...WEAK_JWT_SECRETS,
  "trocar_por_um_segredo_forte",
  "change_this_session_secret",
  "session_secret",
]);

function throwEnvError(message) {
  const error = new Error(`Invalid environment configuration: ${message}`);
  error.name = "EnvValidationError";
  throw error;
}

function getOptionalVar(name, fallbackValue = "") {
  const raw = process.env[name] ?? fallbackValue;
  return typeof raw === "string" ? raw.trim() : "";
}

function getRequiredVar(name, fallbackValue) {
  const value = getOptionalVar(name, fallbackValue);
  if (!value) {
    throwEnvError(`"${name}" is required`);
  }
  return value;
}

function getOptionalAliasedVar(primaryName, fallbackName) {
  return getOptionalVar(primaryName) || getOptionalVar(fallbackName);
}

function getRequiredAliasedVar(primaryName, fallbackName) {
  const value = getOptionalAliasedVar(primaryName, fallbackName);
  if (!value) {
    throwEnvError(`"${primaryName}" or "${fallbackName}" is required`);
  }
  return value;
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

function validateSecret(name, secret) {
  const normalized = secret.trim();
  if (normalized.length < 32) {
    throwEnvError(`"${name}" must be at least 32 characters`);
  }
  if (WEAK_SECRETS.has(normalized.toLowerCase())) {
    throwEnvError(`"${name}" is too weak`);
  }
  if (!hasStrongEntropy(normalized)) {
    throwEnvError(`"${name}" must include mixed character types`);
  }
  return normalized;
}

<<<<<<< HEAD
function validateSessionSecret(secret, isProduction) {
  const normalized = secret.trim();

  if (!isProduction) {
    return normalized;
  }

  if (normalized.length < 48) {
    throwEnvError('"SESSION_SECRET" must be at least 48 characters in production');
  }
  if (WEAK_SESSION_SECRETS.has(normalized.toLowerCase())) {
    throwEnvError('"SESSION_SECRET" is too weak for production');
  }
  if (!hasStrongEntropy(normalized)) {
    throwEnvError('"SESSION_SECRET" must include mixed character types in production');
  }
  return normalized;
}

function validateJwtExpiresIn(value) {
=======
function validateExpiresIn(value, name) {
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
  const normalized = value.trim();
  if (!/^\d+[smhd]$/.test(normalized) && !/^\d+$/.test(normalized)) {
    throwEnvError(
      `"${name}" must be a number of seconds or format like 15m/8h/7d`
    );
  }
  return normalized;
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

function getOptionalUrl(name, fallbackValue = "") {
  const value = getOptionalVar(name, fallbackValue);
  return value ? validateUrl(name, value) : "";
}

function normalizeBaseUrl(value) {
  return value ? value.replace(/\/+$/, "") : "";
}

function getGovbrEndpointUrl(name, fakeBaseUrl, fakePath) {
  const explicitUrl = getOptionalUrl(name);
  if (explicitUrl) {
    return explicitUrl;
  }
  if (fakeBaseUrl) {
    return validateUrl(name, `${fakeBaseUrl}${fakePath}`);
  }
  throwEnvError(`"${name}" is required`);
}

function getGovbrRedirectUri() {
  const value = getOptionalAliasedVar(
    "GOVBR_FAKE_REDIRECT_URI",
    "GOVBR_REDIRECT_URI"
  );
  if (!value) {
    throwEnvError(
      '"GOVBR_FAKE_REDIRECT_URI" or "GOVBR_REDIRECT_URI" is required'
    );
  }
  const redirectUrl = new URL(validateUrl("GOVBR_REDIRECT_URI", value));

  if (redirectUrl.pathname === LEGACY_GOVBR_CALLBACK_PATH) {
    redirectUrl.pathname = GOVBR_CALLBACK_PATH;
  }

  return redirectUrl.toString();
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
    validateUrl("CORS_ORIGIN", origin);
  });

  return Object.freeze(origins);
}

function getList(name) {
  return getOptionalVar(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function validateAdminEmails(emails) {
  return emails.map((email) => {
    const normalized = email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throwEnvError(`"${email}" in ADMIN_GOVBR_EMAILS is not a valid email`);
    }
    return normalized;
  });
}

function requireAtLeastOneAdminIdentifier(adminSubs, adminEmails) {
  if (adminSubs.length === 0 && adminEmails.length === 0) {
    throwEnvError(
      '"ADMIN_GOVBR_SUBS" or "ADMIN_GOVBR_EMAILS" must include at least one value'
    );
  }
}

const NODE_ENV = getOptionalVar("NODE_ENV", "development").toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production";

const dbPassword = getOptionalAliasedVar("DB_PASSWORD", "DB_PASS");
const dbName = getOptionalAliasedVar("DB_NAME", "DB");
const schoolLatitude = parseFloatValue(
  getRequiredVar("SCHOOL_LATITUDE"),
  "SCHOOL_LATITUDE",
  -90,
  90
);
const schoolLongitude = parseFloatValue(
  getRequiredVar("SCHOOL_LONGITUDE"),
  "SCHOOL_LONGITUDE",
  -180,
  180
);
const jwtSecret = validateSecret("JWT_SECRET", getRequiredVar("JWT_SECRET"));
const sessionSecret = validateSecret(
  "SESSION_SECRET",
  getRequiredVar("SESSION_SECRET")
);

if (jwtSecret === sessionSecret) {
  throwEnvError('"JWT_SECRET" and "SESSION_SECRET" must be different');
}

const govbrFakeBaseUrl = normalizeBaseUrl(
  getOptionalUrl(
    "GOVBR_FAKE_BASE_URL",
    IS_PRODUCTION ? "" : DEFAULT_GOVBR_FAKE_BASE_URL
  )
);
const adminSubs = Object.freeze(getList("ADMIN_GOVBR_SUBS"));
const adminEmails = Object.freeze(
  validateAdminEmails(getList("ADMIN_GOVBR_EMAILS"))
);

requireAtLeastOneAdminIdentifier(adminSubs, adminEmails);

const env = {
  NODE_ENV,
  IS_PRODUCTION,
  PORT: parseInteger(getRequiredVar("PORT"), "PORT", 1, 65535),
  DB_HOST: getRequiredVar("DB_HOST"),
  DB_PORT: parseInteger(getOptionalVar("DB_PORT", "3306"), "DB_PORT", 1, 65535),
  DB_USER: getRequiredVar("DB_USER"),
  DB_PASSWORD: IS_PRODUCTION
    ? getRequiredAliasedVar("DB_PASSWORD", "DB_PASS")
    : dbPassword,
  DB_NAME: getRequiredVar("DB_NAME", dbName),
  DB_CONNECTION_LIMIT: parseInteger(
    getOptionalVar("DB_CONNECTION_LIMIT", "10"),
    "DB_CONNECTION_LIMIT",
    1,
    100
  ),
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: validateExpiresIn(
    getRequiredVar("JWT_EXPIRES_IN"),
    "JWT_EXPIRES_IN"
  ),
<<<<<<< HEAD
  SESSION_SECRET: validateSessionSecret(getRequiredVar("SESSION_SECRET"), IS_PRODUCTION),
=======
  FUNCIONARIO_JWT_EXPIRES_IN: validateExpiresIn(
    getOptionalVar("FUNCIONARIO_JWT_EXPIRES_IN", "20m"),
    "FUNCIONARIO_JWT_EXPIRES_IN"
  ),
  SESSION_SECRET: sessionSecret,
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
  SCHOOL_LATITUDE: schoolLatitude,
  SCHOOL_LONGITUDE: schoolLongitude,
  SCHOOL_UNIT_CODE: getOptionalVar("SCHOOL_UNIT_CODE", "DEFAULT") || "DEFAULT",
  COMPANY_LATITUDE: schoolLatitude,
  COMPANY_LONGITUDE: schoolLongitude,
  ALLOWED_RADIUS_METERS: parseFloatValue(
    getRequiredVar("ALLOWED_RADIUS_METERS"),
    "ALLOWED_RADIUS_METERS",
    1,
    10000
  ),
  POINT_RATE_LIMIT_WINDOW_MS: parseInteger(
    getOptionalVar("POINT_RATE_LIMIT_WINDOW_MS", String(5 * 60 * 1000)),
    "POINT_RATE_LIMIT_WINDOW_MS",
    1000,
    60 * 60 * 1000
  ),
  POINT_RATE_LIMIT_MAX: parseInteger(
    getOptionalVar("POINT_RATE_LIMIT_MAX", "500"),
    "POINT_RATE_LIMIT_MAX",
    1,
    10000
  ),
  CORS_ORIGINS: validateCorsOrigins(
    getRequiredVar("CORS_ORIGIN"),
    IS_PRODUCTION
  ),
  GOVBR_FAKE_BASE_URL: govbrFakeBaseUrl,
  GOVBR_AUTHORIZE_URL: getGovbrEndpointUrl(
    "GOVBR_AUTHORIZE_URL",
    govbrFakeBaseUrl,
    "/fake-govbr/authorize"
  ),
  GOVBR_TOKEN_URL: getGovbrEndpointUrl(
    "GOVBR_TOKEN_URL",
    govbrFakeBaseUrl,
    "/fake-govbr/token"
  ),
  GOVBR_USERINFO_URL: getGovbrEndpointUrl(
    "GOVBR_USERINFO_URL",
    govbrFakeBaseUrl,
    "/fake-govbr/userinfo"
  ),
  GOVBR_CLIENT_ID: getRequiredAliasedVar(
    "GOVBR_FAKE_CLIENT_ID",
    "GOVBR_CLIENT_ID"
  ),
  GOVBR_CLIENT_SECRET: getRequiredAliasedVar(
    "GOVBR_FAKE_CLIENT_SECRET",
    "GOVBR_CLIENT_SECRET"
  ),
  GOVBR_REDIRECT_URI: getGovbrRedirectUri(),
  ADMIN_GOVBR_SUBS: adminSubs,
  ADMIN_GOVBR_EMAILS: adminEmails,
  BCRYPT_SALT_ROUNDS: parseInteger(
    getOptionalVar("BCRYPT_SALT_ROUNDS", "12"),
    "BCRYPT_SALT_ROUNDS",
    10,
    15
  ),
};

module.exports = Object.freeze(env);
