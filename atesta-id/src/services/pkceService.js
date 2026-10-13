'use strict';

const {
  base64url,
  sha256Ascii,
  timingSafeStringEquals
} = require('../utils/crypto');

// Limites e charset definidos pela RFC 7636 (PKCE) para o "code_verifier":
// string de 43 a 128 caracteres, restrita a [A-Z] [a-z] [0-9] "-" "." "_" "~".
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

// Implementa o método "S256" do PKCE: challenge = BASE64URL(SHA256(code_verifier)).
// Este é o único método suportado (ver validação de codeChallengeMethod no controller);
// o método "plain" da RFC não é implementado neste serviço.
function calculateS256(codeVerifier) {
  const verifier = validateCodeVerifierFormat(codeVerifier);

  return base64url(sha256Ascii(verifier));
}

// Recalcula o challenge a partir do verifier recebido no token exchange e compara,
// em tempo constante, com o challenge armazenado no authorize original — validando
// que quem troca o code pelo token é o mesmo client que iniciou o fluxo.
// Qualquer erro de formato/validação é tratado como falha de verificação (retorna
// false) em vez de propagar a exceção, mantendo uma interface simples de checagem.
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