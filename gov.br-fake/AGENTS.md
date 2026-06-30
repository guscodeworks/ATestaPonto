# AGENTS.md — gov.br-fake

## 1. Identidade do projeto

Este projeto é um simulador técnico local do Gov.br/Login Único.

Ele existe para demonstração, estudo e apresentação do fluxo de autenticação Gov.br usado pelo projeto `ponto-escolar`.

O `gov.br-fake` **não é produção** e **não substitui o Gov.br real**.

---

## 2. Papel do simulador

O `gov.br-fake` simula apenas a etapa de autenticação.

Ele responde:

* quem é o usuário;
* se o login simulado foi aceito;
* dados básicos simulados via `/userinfo`.

Ele não decide:

* se o usuário é admin do Ponto Escolar;
* se o usuário pode acessar `/admin/dashboard`;
* regras internas de permissão do sistema principal.

**Gov.br autentica. Ponto Escolar autoriza.**

---

## 3. Separação com `ponto-escolar`

* Não misturar código do `gov.br-fake` dentro do `ponto-escolar`.
* Não copiar regras internas do `ponto-escolar` para o simulador.
* Não implementar autorização final de admin dentro do simulador.
* O `ponto-escolar` pode consumir este simulador via variáveis de ambiente durante apresentações.

---

## 4. Regras obrigatórias

* Tratar sempre como ambiente local, técnico e demonstrativo.
* Não usar como produção.
* Não coletar dados reais.
* Não armazenar CPF real.
* Não se passar pelo Gov.br real em ambiente público.
* Não usar marca, layout ou comportamento de forma que pareça serviço oficial em produção.
* Não enviar `access_token` pela URL.
* O `access_token` só deve ser emitido pelo endpoint de token.
* Não decidir permissão administrativa do Ponto Escolar.
* Não criar regra fake que libere admin no sistema principal.

---

## 5. Fluxo esperado

Fluxo correto da integração simulada:

1. Usuário inicia ação no `ponto-escolar`.
2. `ponto-escolar` redireciona para o `gov.br-fake`.
3. `gov.br-fake` mostra tela simulada de login.
4. Usuário faz login no simulador.
5. Simulador retorna `code` para o callback do `ponto-escolar`.
6. `ponto-escolar` troca `code` por token no simulador.
7. `ponto-escolar` busca `/userinfo`.
8. `ponto-escolar` decide se o usuário tem permissão administrativa.

---

## 6. Regra sobre `Gerenciar pontos`

O botão `Gerenciar pontos` não deve chamar diretamente:

```txt
/auth/govbr/callback
```

O correto é iniciar o fluxo pelo `ponto-escolar`, normalmente em:

```txt
http://localhost:3000/auth/govbr/login
```

Assim o `ponto-escolar` cria e controla:

* `state`;
* `codeVerifier`;
* `codeChallenge`;
* sessão temporária OAuth;
* validação do callback.

---

## 7. Rotas esperadas

Rotas possíveis do simulador:

* `/`
* `/govbr`
* `/govbr/login`
* `/govbr/logout`
* `/govbr/gerenciar-pontos`
* `/fake-govbr/authorize`
* `/fake-govbr/token`
* `/fake-govbr/userinfo`

Não criar rotas que substituam a autorização interna do `ponto-escolar`.

---

## 8. Segurança

* Não mandar token na URL.
* Não mandar dados sensíveis na URL.
* Não coletar dados reais.
* Não salvar dados reais no banco ou em arquivos.
* Não usar secrets reais.
* Não expor credenciais.
* Não remover validações do fluxo OAuth simulado.
* Não autorizar admin dentro do simulador.

---

## 9. Regras de edição para o Codex

Antes de alterar qualquer arquivo:

1. Leia o `AGENTS.md` do workspace geral.
2. Leia este `AGENTS.md`.
3. Analise o código real existente.
4. Entenda o escopo da tarefa.
5. Faça a menor alteração possível.
6. Se houver conflito entre este arquivo e o código real, explique antes de alterar.

Proibido sem pedido explícito:

* mexer no `ponto-escolar`;
* copiar código do simulador para o sistema principal;
* criar fluxo de autorização admin no simulador;
* alterar rotas principais do OAuth simulado;
* criar dados reais ou credenciais reais;
* trocar a arquitetura do projeto sem necessidade.

---

## 10. Git e testes

* Não fazer commit sem autorização explícita.
* Não fazer push sem autorização explícita.
* Commits, quando solicitados, devem ser atômicos e descritivos.
* Não misturar alterações de `gov.br-fake` e `ponto-escolar` no mesmo commit.
* Testar o fluxo OAuth simulado quando possível.
* Se não for possível testar, informar o motivo e sugerir validação manual.

---

## 11. Prioridade final

> O `gov.br-fake` apenas simula autenticação.
>
> A autorização administrativa pertence ao `ponto-escolar`.
>
> Token válido nunca deve significar permissão administrativa.
