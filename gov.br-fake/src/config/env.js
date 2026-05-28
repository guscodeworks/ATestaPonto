'use strict';

const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const DEFAULT_PORT = 4000;
const DEFAULT_HOST = 'localhost';

function parsePort(value) {
  const raw = String(value || DEFAULT_PORT).trim();
  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid gov.br-fake PORT configuration.');
  }

  return port;
}

const env = Object.freeze({
  nodeEnv: String(process.env.NODE_ENV || 'development').trim().toLowerCase(),
  host: process.env.HOST || DEFAULT_HOST,
  port: parsePort(process.env.PORT),
  environmentLabel: 'local-demonstrativo',
  authCodeTtlMs: 5 * 60 * 1000,
  accessTokenTtlMs: 60 * 60 * 1000,
  pendingAuthorizeRequestTtlMs: 10 * 60 * 1000,
  cleanupIntervalMs: 60 * 1000
});

module.exports = {
  env
};
