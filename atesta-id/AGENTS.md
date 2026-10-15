## Purpose

- ATestaID é um simulador local OAuth para identidades fictícias, não o Gov.br oficial nem um serviço de produção.

## Commands

- Em `atesta-id/`, `npm run check` verifica a sintaxe de `server.js`.
- `npm test` executa os testes existentes; use quando pertinente, após conferir seus efeitos colaterais.
- `npm start` inicia o simulador local com a configuração do ambiente.

## Constraints

- Preserve Authorization Code, PKCE S256, `state`, code de uso único, emissão pelo endpoint de token, `userinfo`, cookies e validação de cliente.
- Autorização administrativa, RBAC e dashboard pertencem ao gateway/Spring; não crie atalhos que substituam essa autorização.
- Não use, colete ou armazene credenciais ou dados pessoais reais; não exponha o simulador publicamente de forma que pareça um serviço oficial.
- Use URLs configuráveis: `Gerenciar pontos` inicia o fluxo por `PONTO_ESCOLAR_START_URL` em `/auth/govbr/login`; não chame o callback diretamente nem fixe host ou porta.

## Done when

- Fluxo preservado: gateway inicia OAuth, simulador autentica e devolve code; gateway troca code por token, consulta userinfo e decide autorização.
