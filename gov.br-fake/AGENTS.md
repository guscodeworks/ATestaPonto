# AGENTS.md — gov.br-fake

Complementa as regras gerais do AGENTS.md da raiz para o simulador técnico local.

## Papel e limites

- Ambiente de demonstração, estudo e apresentação; não substitui o Gov.br real
  nem deve ser utilizado em produção.
- Simula autenticação e dados básicos via userinfo. Não decide permissão admin,
  acesso ao dashboard ou RBAC do Ponto Escolar.
- Não colete ou armazene CPF, dados pessoais ou credenciais reais.
- Não se apresente como serviço oficial em ambiente público nem use identidade
  visual de forma que induza essa interpretação.
- Não copie regras internas do sistema principal para o simulador.

## OAuth simulado

- Preserve validações do fluxo OAuth. Access token é emitido somente pelo
  endpoint de token; nunca o envie pela URL.
- Fluxo: Ponto Escolar inicia OAuth, simulador autentica e devolve code;
  Ponto Escolar troca code por token, consulta userinfo e decide autorização.
- `Gerenciar pontos` deve iniciar o fluxo no Ponto Escolar usando
  `PONTO_ESCOLAR_START_URL` configurada, com caminho `/auth/govbr/login`.
  Nunca chame o callback diretamente nem fixe host ou porta.
- Ponto Escolar controla state, codeVerifier, codeChallenge, sessão temporária
  e validação do callback.
- Preserve as rotas existentes do simulador (incluindo authorize, token e
  userinfo); não altere o fluxo principal sem solicitação explícita.
- Não crie rotas ou regras fake que substituam a autorização do sistema real.
