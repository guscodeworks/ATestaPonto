'use strict';

const crypto = require('crypto');

const MIN_VERIFIER_LENGTH = 43;
const MAX_VERIFIER_LENGTH = 128;

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function gerarTextoSeguro(bytes = 32) {
  if (!Number.isInteger(bytes) || bytes < 32 || bytes > 96) {
    throw new RangeError('O codeVerifier deve resultar em um texto entre 43 e 128 caracteres.');
  }

  const texto = base64url(crypto.randomBytes(bytes));

  if (texto.length < MIN_VERIFIER_LENGTH || texto.length > MAX_VERIFIER_LENGTH) {
    throw new RangeError('O codeVerifier deve ter entre 43 e 128 caracteres.');
  }

  return texto;
}

function gerarCodeChallenge(codeVerifier) {
  const verifier = String(codeVerifier || '');

  if (
    verifier.length < MIN_VERIFIER_LENGTH ||
    verifier.length > MAX_VERIFIER_LENGTH ||
    !/^[A-Za-z0-9\-._~]+$/.test(verifier)
  ) {
    throw new TypeError('codeVerifier PKCE invalido.');
  }

  const digest = crypto.createHash('sha256').update(verifier, 'ascii').digest();
  return base64url(digest);
}

module.exports = {
  base64url,
  gerarTextoSeguro,
  gerarCodeChallenge
};
