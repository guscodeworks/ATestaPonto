'use strict';

class AuthCode {
  constructor({ codeChallenge, redirectUri, clientId, userSub, expiresAt }) {
    this.codeChallenge = String(codeChallenge || '').trim();
    this.redirectUri = String(redirectUri || '').trim();
    this.clientId = String(clientId || '').trim();
    this.userSub = String(userSub || '').trim();
    this.expiresAt = Number(expiresAt);

    Object.freeze(this);
  }

  isExpired(now = Date.now()) {
    return !Number.isFinite(this.expiresAt) || this.expiresAt <= now;
  }
}

module.exports = AuthCode;
