'use strict';

const {
  base64url,
  sha256Ascii,
  timingSafeStringEquals
} = require('../utils/crypto');

const MIN_CODE_VERIFIER_LENGTH = 43;
const MAX_CODE_VERIFIER_LENGTH = 128;
const PKCE_ALLOWED_CHARS = /^[A-Za-z0-9\-._~]+$/;

function getRequiredString(value, name) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    throw new TypeError(`${name} is required.`);
  }

  return normalized;
}

function validateCodeVerifierFormat(codeVerifier) {
  const verifier = getRequiredString(codeVerifier, 'codeVerifier');

  if (
    verifier.length < MIN_CODE_VERIFIER_LENGTH ||
    verifier.length > MAX_CODE_VERIFIER_LENGTH ||
    !PKCE_ALLOWED_CHARS.test(verifier)
  ) {
    throw new TypeError('Invalid PKCE codeVerifier.');
  }

  return verifier;
}

function calculateS256(codeVerifier) {
  const verifier = validateCodeVerifierFormat(codeVerifier);

  return base64url(sha256Ascii(verifier));
}

function validateS256({ codeVerifier, codeChallenge }) {
  try {
    const expectedChallenge = getRequiredString(codeChallenge, 'codeChallenge');
    const calculatedChallenge = calculateS256(codeVerifier);

    return timingSafeStringEquals(calculatedChallenge, expectedChallenge);
  } catch (_error) {
    return false;
  }
}

module.exports = {
  calculateS256,
  validateS256,
  validateCodeVerifierFormat
};
