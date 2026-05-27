# AGENTS.md — gov.br-fake

## Objetivo

Este projeto é um simulador técnico local do Gov.br/Login Único.

Ele existe porque o objetivo final é apresentar o sistema Ponto Escolar para o Estado/Gov.br, demonstrando como ficaria a integração com autenticação Gov.br na prática.

Como ainda não existem credenciais oficiais, autorização institucional ou permissão para usar diretamente a API real do Gov.br/Login Único, este projeto simula esse ambiente de forma local, didática e funcional.

O `gov.br-fake` não substitui o Gov.br real.

Ele serve apenas para demonstrar como o `ponto-escolar` se comportaria caso estivesse integrado oficialmente ao Gov.br.

## Papel do gov.br-fake

O `gov.br-fake` simula o papel do Gov.br.

Ele responde:

Quem é esse usuário?

Ele NÃO decide:

Esse usuário pode acessar o dashboard do Ponto Escolar?

Essa decisão pertence ao `ponto-escolar`.

## Regras obrigatórias

- Tratar como ambiente de simulação técnica.
- Deixar claro que é ambiente local/demonstrativo.
- Não coletar dados reais.
- Não armazenar CPF real.
- Não se passar pelo Gov.br real em ambiente público.
- Não enviar `access_token` pela URL.
- O `access_token` só deve ser gerado no endpoint de token.
- Não misturar código com o projeto `ponto-escolar`.
- Não decidir permissão final de admin do sistema Ponto Escolar.

## Fluxo esperado

Usuário acessa o `gov.br-fake`.

Depois:

1. Visualiza uma tela simulada do Gov.br.
2. Faz login no simulador.
3. Clica em `Gerenciar pontos`.
4. O fluxo OAuth simulado é iniciado.
5. O usuário é redirecionado para o `ponto-escolar`.
6. O `ponto-escolar` valida o usuário e decide se libera o dashboard.

## Rotas esperadas

Rotas possíveis do simulador:

- `/`
- `/govbr`
- `/govbr/login`
- `/govbr/logout`
- `/govbr/gerenciar-pontos`
- `/fake-govbr/authorize`
- `/fake-govbr/token`
- `/fake-govbr/userinfo`

## Regra sobre o botão Gerenciar pontos

O botão `Gerenciar pontos` NÃO deve chamar direto o callback:

`/auth/govbr/callback`

O correto é iniciar o fluxo pelo `ponto-escolar`, normalmente em:

`http://localhost:3000/auth/govbr/login`

Assim o `ponto-escolar` cria:

- state
- codeVerifier
- codeChallenge

E só depois recebe o callback.

## Segurança

- Não mandar token na URL.
- Não mandar dados sensíveis na URL.
- Não coletar dados reais.
- Não usar como produção.
- Não autorizar admin dentro do simulador.