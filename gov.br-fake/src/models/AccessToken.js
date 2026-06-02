'use strict';

class AccessToken {
  constructor({ userSub, expiresAt }) {
    this.userSub = String(userSub || '').trim();
    this.expiresAt = Number(expiresAt);

    Object.freeze(this);
  }

  isExpired(now = Date.now()) {
    return !Number.isFinite(this.expiresAt) || this.expiresAt <= now;
  }
}

module.exports = AccessToken;
