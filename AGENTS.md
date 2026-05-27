# AGENTS.md — Workspace Geral

## Projetos neste workspace

Este workspace possui dois projetos separados:

- `gov.br-fake`
  - Simulador técnico local do Gov.br/Login Único.

- `ponto-escolar`
  - Sistema principal Ponto Escolar.

## Regra principal

Não misturar os dois projetos.

Antes de alterar qualquer arquivo, identifique em qual pasta está trabalhando.

Se estiver em `gov.br-fake`, trate como simulador técnico local do Gov.br.

Se estiver em `ponto-escolar`, trate como sistema principal Ponto Escolar.

## Papel de cada projeto

### gov.br-fake

O `gov.br-fake` existe para simular como seria a integração com o Gov.br/Login Único, já que ainda não existem credenciais oficiais ou permissão para consumir a API real.

Ele é usado para apresentação, estudo e demonstração técnica.

Ele não é produção.

### ponto-escolar

O `ponto-escolar` é o projeto principal.

Ele representa o sistema real de controle de ponto escolar.

Ele deve estar preparado para usar o Gov.br real futuramente, mas durante apresentação pode consumir o `gov.br-fake` como simulador.

## Regra de arquitetura

Gov.br autentica.

Ponto Escolar autoriza.

Isso significa:

- O Gov.br ou simulador confirma quem é o usuário.
- O Ponto Escolar decide se esse usuário pode acessar o dashboard admin.

## Regra de ouro

Token válido não significa permissão administrativa.

A permissão de admin deve ser decidida internamente pelo `ponto-escolar`.

## Proibido

- Misturar código do `gov.br-fake` dentro do `ponto-escolar`.
- Colocar lógica fake de escolher Admin/Funcionário dentro do sistema real.
- Enviar token pela URL.
- Aceitar token vindo do front-end como prova de login.
- Liberar dashboard apenas porque existe token.