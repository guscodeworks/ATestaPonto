'use strict';

class FakeUser {
  constructor({ sub, name, email, password }) {
    this.sub = String(sub || '').trim();
    this.name = String(name || '').trim();
    this.email = String(email || '').trim();
    this.password = String(password || '');

    Object.freeze(this);
  }

  toUserInfo() {
    return {
      sub: this.sub,
      name: this.name,
      email: this.email
    };
  }
}

module.exports = FakeUser;
