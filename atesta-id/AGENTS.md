## Purpose

- ATestaID é exclusivamente um simulador local de integração OAuth/OIDC para desenvolvimento e testes com identidades fictícias; implementa Authorization Code e `userinfo`, sem equivaler a um provedor OIDC completo. Não é o Gov.br oficial e nunca deve ser implantado como Gov.br de produção.
- O consumidor OAuth pode ser o Spring Boot ou o gateway legado durante a transição; preserve a integração configurável com ambos, sem acoplar o simulador a um backend específico.

## Commands

- Em `atesta-id/`, `npm run check` verifica a sintaxe de `server.js`.
- `npm test` aponta para `test/*.test.js`, ausente na árvore versionada atual; não o trate como validação disponível nem crie testes ou scripts auxiliares sem solicitação.
- `npm start` inicia o simulador local com a configuração do ambiente.

## Constraints

- Preserve Authorization Code, PKCE S256, `state`, callback configurável com validação de `redirect_uri`, code de uso único, emissão pelo endpoint de token, `userinfo`, cookies e validação de cliente.
- Autenticação no simulador não concede autorização administrativa; cadastro ativo, RBAC, escopo territorial e acesso ao dashboard são responsabilidade do backend consumidor, Spring Boot ou gateway legado, com falha fechada conforme a raiz.
- Não crie atalhos de autenticação ou autorização: não ignore PKCE, validação de cliente, callback ou troca de code por token, nem use identidades fictícias para conceder acesso automático no backend.
- Não use, colete ou armazene credenciais ou dados pessoais reais; não exponha o simulador publicamente de forma que pareça um serviço oficial.
- Use URLs configuráveis: `Gerenciar pontos` inicia o fluxo por `PONTO_ESCOLAR_START_URL` em `/auth/govbr/login`; não chame o callback diretamente nem fixe host ou porta.
- Não faça alterações não solicitadas nem crie arquivos auxiliares, scripts ou documentação adicional fora do escopo autorizado.

## Done when

- Fluxo preservado: backend consumidor inicia OAuth, simulador autentica a identidade fictícia e devolve code ao callback configurado; backend troca code por token, consulta `userinfo` e decide a autorização administrativa.
