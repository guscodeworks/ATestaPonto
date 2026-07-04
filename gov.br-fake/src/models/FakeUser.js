'use strict';

class FakeUser {
  constructor({ sub, name, email, password }) {
    this.sub = String(sub || '').trim();
    this.name = String(name || '').trim();
    this.email = String(email || '').trim();
    this.password = String(password || '');

    Object.freeze(this);
  }

  // Retorna apenas os dados públicos do usuário (equivalente a um claim set OIDC),
  // omitindo deliberadamente a senha para que ela nunca seja exposta em respostas
  // de API (ex.: endpoint /userinfo) ou em sessões/tokens.
  toUserInfo() {
    return {
      sub: this.sub,
      name: this.name,
      email: this.email
    };
  }
}

module.exports = FakeUser;