"use strict";

const crypto = require("node:crypto");
const env = require("../config/env");
const { normalizeCpf, isValidCpf } = require("./cpf");

function digestSubject(value) {
  return crypto.createHmac("sha256", env.SESSION_SECRET)
    .update(JSON.stringify(["rate-limit-v1", value])).digest("hex");
}

function loginSubject(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid";
  const value = body.identificador ?? body.login ?? body.email ?? body.cpf;
  if (typeof value !== "string" || value.length > 150) return "invalid";
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? `email:${normalized}` : "invalid";
  }
  const cpf = normalizeCpf(normalized);
  return isValidCpf(cpf) ? `cpf:${cpf}` : "invalid";
}

module.exports = { digestSubject, loginSubject };
