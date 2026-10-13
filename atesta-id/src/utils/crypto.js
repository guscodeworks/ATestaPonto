'use strict';

const crypto = require('crypto');

// Codifica em Base64 URL-safe (RFC 4648 §5): substitui "+"/"/" e remove o padding "=",
// necessário para valores usados em URLs (ex.: tokens, PKCE code_challenge).
function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// Gera um token aleatoriamente seguro (32 bytes de entropia via CSPRNG), prefixado
// para facilitar identificar a origem/tipo do token em logs (ex.: "fake_access_...").
function generateSecureToken(prefix) {
  return `${prefix}_${base64url(crypto.randomBytes(32))}`;
}

// Compara strings em tempo constante para evitar ataques de timing (ex.: na validação
// de client_secret, tokens e code_challenge). O early-return por tamanho é seguro aqui
// porque o comprimento das strings comparadas não costuma ser informação sensível.
function timingSafeStringEquals(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''), 'utf8');
  const right = Buffer.from(String(rightValue || ''), 'utf8');

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Usa encoding "ascii" propositalmente: o PKCE code_verifier (RFC 7636) é restrito a
// um charset ASCII, então este hash é usado especificamente para o cálculo do S256.
function sha256Ascii(value) {
  return crypto.createHash('sha256').update(String(value), 'ascii').digest();
}

module.exports = {
  base64url,
  generateSecureToken,
  timingSafeStringEquals,
  sha256Ascii
};