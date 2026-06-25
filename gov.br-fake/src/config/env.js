"use strict";

const dotenv = require("dotenv");

dotenv.config({ quiet: true });

const DEFAULT_PORT = "4000";
const DEFAULT_HOST = "127.0.0.1" || "0.0.0.0";

function parsePort(value) {
  const raw = String(value || DEFAULT_PORT).trim();
  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid gov.br-fake PORT configuration.");
  }

  return port;
}

const env = Object.freeze({
  nodeEnv: String(process.env.NODE_ENV || "development")
    .trim()
    .toLowerCase(),
  host: process.env.HOST || DEFAULT_HOST,
  port: parsePort(process.env.GOVBR_FAKE_PORT || process.env.PORT),
  environmentLabel: "local-demonstrativo",
  clientId: String(process.env.GOVBR_FAKE_CLIENT_ID || "ponto-escolar").trim(),
  clientSecret: String(
    process.env.GOVBR_FAKE_CLIENT_SECRET || "dev-secret"
  ).trim(),
  pontoEscolarRedirectUri: String(
    process.env.PONTO_ESCOLAR_REDIRECT_URI ||
      "http://127.0.0.1:3000/auth/govbr/callback"
  ).trim(),
  pontoEscolarStartUrl: String(
    process.env.PONTO_ESCOLAR_START_URL ||
      "http://127.0.0.1:3000/auth/govbr/login"
  ).trim(),
  fakeAdminSub: String(
    process.env.GOVBR_FAKE_ADMIN_SUB || "admin-local-001"
  ).trim(),
  fakeAdminName: String(
    process.env.GOVBR_FAKE_ADMIN_NAME || "Administrador Local"
  ).trim(),
  fakeAdminEmail: String(
    process.env.GOVBR_FAKE_ADMIN_EMAIL || "admin@ponto-escolar.local"
  ).trim(),
  fakeSessionTtlMs: 2 * 60 * 60 * 1000,
  authCodeTtlMs: 5 * 60 * 1000,
  accessTokenTtlMs: 60 * 60 * 1000,
  pendingAuthorizeRequestTtlMs: 10 * 60 * 1000,
  cleanupIntervalMs: 60 * 1000,
});

module.exports = {
  env,
};
