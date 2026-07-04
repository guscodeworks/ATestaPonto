'use strict';

class AccessToken {
  constructor({ userSub, expiresAt }) {
    this.userSub = String(userSub || '').trim();
    this.expiresAt = Number(expiresAt);

    // Instância imutável: um access token não deve ser alterado após emitido.
    Object.freeze(this);
  }

  // Trata "expiresAt" ausente/inválido (NaN) como token já expirado, evitando que um
  // valor malformado permita uso indevido de um token sem expiração definida.
  isExpired(now = Date.now()) {
    return !Number.isFinite(this.expiresAt) || this.expiresAt <= now;
  }
}

module.exports = AccessToken;