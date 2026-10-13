'use strict';

class FakeUser {
  constructor({ sub, name, email, login, password }) {
    this.sub = String(sub || '').trim();
    this.name = String(name || '').trim();
    this.email = String(email || '').trim();
    this.login = String(login || '').trim();
    this.password = String(password || '');

    Object.freeze(this);
  }

  // Extrai os dígitos do sub para expor como CPF (claim Gov.br 'cpf').
  // No fluxo admin real, o CPF do administrativo é resolvido a partir de
  // userInfo.cpf (usuarios_administrativos.cpf é char(11) dígitos). O simulador
  // apenas replica o formato do dado que o Gov.br real fornece, sem adicionar
  // tabela/coluna nem comportamento novo: somente subs puramente numéricos de
  // 11 dígitos produzem um cpf válido; demais casos devolvem null (alinhado ao
  // CHECK ^[0-9]{11}$ da coluna no banco real).
  get cpf() {
    const digits = String(this.sub || '').replace(/\D/g, '');
    return digits.length === 11 ? digits : null;
  }

  // Retorna apenas os dados públicos do usuário (equivalente a um claim set OIDC),
  // omitindo deliberadamente a senha para que ela nunca seja exposta em respostas
  // de API (ex.: endpoint /userinfo) ou em sessões/tokens.
  toUserInfo() {
    return {
      sub: this.sub,
      name: this.name,
      email: this.email,
      cpf: this.cpf
    };
  }
}

module.exports = FakeUser;
