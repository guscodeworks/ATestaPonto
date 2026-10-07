# AGENTS.md — ponto-escolar

Complementa as regras gerais do AGENTS.md da raiz para o sistema principal Node.js.

## Estrutura Node

- Preserve CommonJS (`require`/`module.exports`); não migre para ESM sem solicitação.
- Routes definem endpoints e middlewares; controllers encaminham HTTP aos services.
- Models existentes executam SQL; middlewares protegem sessão, RBAC e escopo;
  utils guardam funções reutilizáveis.
- Reutilize o cliente Spring existente para chamadas assinadas. Valide respostas
  internas e projete explicitamente os campos públicos antes de responder ao navegador.
- Não duplique dashboard nem altere frontend ou QR Code fora da tarefa solicitada.

## Autenticação administrativa

- Sessão administrativa é criada internamente após autenticação Gov.br/OIDC e
  autorização pelo cadastro administrativo e acessos ativos do sistema.
- Preserve `req.session.admin`, validação de `state`, PKCE, callback e revalidação
  administrativa. Não substitua autorização por presença de token ou perfil do provedor.
- Fluxo: `/admin/dashboard` exige sessão; `/auth/govbr/login` inicia OAuth;
  `/auth/govbr/callback` troca code, consulta userinfo e resolve o administrativo;
  `/auth/govbr/logout` encerra a sessão.
- Não crie `isAdmin` fake, usuário fake no fluxo real ou tela de escolha de perfil.
- Simulador pode ser usado por configuração em demonstrações. A troca para Gov.br
  real não deve introduzir lógica fake no sistema principal.
- Login pode escrever último login e sessão/Redis. Não o use como validação
  somente leitura sem autorização para esses efeitos.

## Funcionário e ponto

- Funcionário não acessa dashboard administrativo nem usa o fluxo admin Gov.br.
- Rotas de ponto permanecem separadas das rotas administrativas.
- Preserve identificação e elegibilidade do funcionário, validação de acesso
  local/QR, sequência de marcações e proteção contra duplicidade antes de registrar ponto.
- Funcionário não define cargo, perfil ou permissões críticas pelo navegador.

## Configuração e diagnóstico

- Reutilize `src/config/env.js` e `src/config/database.js` para a configuração real.
- `npm run dev:check` verifica a conexão usando somente SELECT 1; não inicializa schema.
- Não remapeie DB_HOST no launcher Spring. Configuração de Java/Maven e banco
  pertence ao ambiente, sem inferência automática de Docker ou fallback de hosts.
