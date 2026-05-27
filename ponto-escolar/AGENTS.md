# AGENTS.md — ponto-escolar

## Objetivo

Este é o sistema principal Ponto Escolar.

Ele controla:

- dashboard administrativo;
- registro de ponto dos funcionários;
- validações internas;
- integração com Gov.br real ou simulador OIDC.

Durante apresentação, o projeto pode usar o `gov.br-fake`.

Futuramente, deve poder trocar para o Gov.br real apenas alterando configurações e credenciais.

## Regra principal

Gov.br autentica.

Ponto Escolar autoriza.

Ou seja:

- O Gov.br ou simulador confirma quem é o usuário.
- O Ponto Escolar decide se esse usuário pode acessar o dashboard administrativo.

## Relação com o gov.br-fake

O projeto `gov.br-fake` é apenas um simulador técnico local do Gov.br/Login Único.

Ele existe porque ainda não existem credenciais oficiais ou permissão para usar diretamente a API real do Gov.br.

O `ponto-escolar` pode consumir o `gov.br-fake` durante apresentações para demonstrar como o fluxo funcionaria com o Gov.br real.

Mas o `ponto-escolar` NÃO deve ter lógica fake de escolher Admin ou Funcionário no back-end real.

## Fluxo do administrador

O administrador acessa:

/admin/dashboard

Essa rota deve ser protegida.

Fluxo esperado:

1. Admin clica em `Gerenciar pontos`.
2. O sistema redireciona para `/auth/govbr/login`.
3. O back-end gera:
   - state
   - codeVerifier
   - codeChallenge
4. O back-end salva temporariamente na sessão:

   req.session.oauthGovbr = {
     state,
     codeVerifier
   }

5. O back-end redireciona para Gov.br ou simulador.
6. O usuário faz login.
7. O provedor retorna para `/auth/govbr/callback`.
8. O back-end valida:
   - code
   - state
   - sessão OAuth
   - PKCE
9. O back-end troca o `code` por token.
10. O back-end busca `/userinfo`.
11. O back-end verifica se `userInfo.sub` é admin.
12. Se for admin, cria sessão local.
13. Se não for admin, retorna `403 Acesso negado`.

## Sessão local admin

Depois de autenticar e autorizar o usuário, criar:

req.session.admin = {
  authProvider: "govbr",
  sub: userInfo.sub,
  name: userInfo.name,
  email: userInfo.email,
  loginAt: new Date().toISOString()
}

O dashboard admin deve depender de `req.session.admin`.

Não deve depender diretamente do token Gov.br.

## Fluxo do funcionário

O funcionário não acessa `/admin/dashboard`.

O funcionário usa o sistema para bater ponto.

Fluxo esperado:

1. Funcionário acessa a tela de ponto.
2. Sistema identifica o funcionário.
3. Sistema verifica se o funcionário existe.
4. Sistema verifica se está ativo.
5. Sistema valida local, QR Code ou regra de acesso.
6. Sistema verifica marcação do dia.
7. Sistema registra entrada ou saída.
8. Sistema salva no banco.
9. Sistema mostra confirmação.

## Regras do funcionário

- Funcionário não acessa dashboard admin.
- Funcionário não passa pelo fluxo admin Gov.br.
- Funcionário registra ponto.
- Funcionário é validado pelas regras internas.
- Funcionário não decide seu próprio cargo ou permissão.

## Rotas esperadas

Autenticação admin:

- /auth/govbr/login
- /auth/govbr/callback
- /auth/govbr/logout

Dashboard admin:

- /admin/dashboard

Rotas de ponto devem ficar separadas das rotas admin.

Exemplos possíveis:

- /ponto
- /ponto/registrar
- /ponto/qrcode

## Middleware admin

O dashboard deve ser protegido por:

src/middlewares/ensureAdminAuthenticated.js

Esse middleware deve:

1. Verificar se existe `req.session.admin`.
2. Se não existir, redirecionar para `/auth/govbr/login`.
3. Se existir, definir `req.user = req.session.admin`.
4. Chamar `next()`.

Exemplo de lógica esperada:

function ensureAdminAuthenticated(req, res, next) {
  if (!req.session || !req.session.admin) {
    return res.redirect("/auth/govbr/login");
  }

  req.user = req.session.admin;
  return next();
}

module.exports = ensureAdminAuthenticated;

## Regra de autorização admin

Por enquanto, pode usar:

ADMIN_GOVBR_SUBS=11122233344

A regra deve comparar:

userInfo.sub

com a lista `ADMIN_GOVBR_SUBS`.

No futuro, trocar por consulta no banco:

1. Buscar usuário pelo sub/CPF retornado pelo Gov.br.
2. Verificar se existe.
3. Verificar se está ativo.
4. Verificar se tem cargo/perfil admin.
5. Liberar ou bloquear dashboard.

## Variáveis de ambiente

Durante apresentação com simulador:

GOVBR_AUTHORIZE_URL=http://localhost:4000/fake-govbr/authorize
GOVBR_TOKEN_URL=http://localhost:4000/fake-govbr/token
GOVBR_USERINFO_URL=http://localhost:4000/fake-govbr/userinfo

Futuro Gov.br real:

GOVBR_AUTHORIZE_URL=https://sso.staging.acesso.gov.br/authorize
GOVBR_TOKEN_URL=https://sso.staging.acesso.gov.br/token
GOVBR_USERINFO_URL=https://sso.staging.acesso.gov.br/userinfo/

Outras variáveis esperadas:

GOVBR_CLIENT_ID=colocar_client_id_aqui
GOVBR_CLIENT_SECRET=colocar_client_secret_aqui
GOVBR_REDIRECT_URI=http://localhost:3000/auth/govbr/callback
SESSION_SECRET=trocar_por_um_segredo_forte
ADMIN_GOVBR_SUBS=11122233344

## Regras obrigatórias de segurança

- Token válido não significa admin.
- Gov.br autentica.
- Ponto Escolar autoriza.
- Não aceitar `access_token` por query string.
- Não aceitar `access_token` vindo do front-end como prova de login.
- Não enviar token pela URL.
- Não usar token Gov.br como sessão principal.
- Criar sessão local própria da aplicação.
- Não remover validação de `state`.
- Não remover PKCE.
- Não remover verificação de admin.
- Não criar `isAdmin` fake.
- Não criar usuário fake no fluxo real.
- Não criar tela para escolher Admin ou Funcionário.
- Não salvar `GOVBR_CLIENT_SECRET` no código.
- Usar apenas `process.env.GOVBR_CLIENT_SECRET`.
- Não mexer em QR Code sem pedido explícito.
- Não mexer no banco sem pedido explícito.
- Não duplicar `app.listen`.
- Usar CommonJS com `require` e `module.exports`.
- Não usar `import/export`, a menos que o projeto inteiro já esteja configurado para ESM.

## O que o Codex não deve fazer

- Não copiar código fake do `gov.br-fake` para o back-end real sem adaptação.
- Não criar login fake dentro do `ponto-escolar`.
- Não criar tela escolhendo Admin ou Funcionário.
- Não criar usuário fake no fluxo real.
- Não criar `isAdmin` fake.
- Não liberar admin pelo front-end.
- Não aceitar token vindo do navegador como prova de admin.
- Não aceitar token pela URL.
- Não quebrar o fluxo de QR Code.
- Não criar dashboard duplicado se já existir.
- Não trocar CommonJS por import/export sem pedido.
- Não mexer no banco de dados sem pedido explícito.

## Estrutura recomendada

src/
  routes/
    govbrAuth.routes.js
    admin.routes.js
    ponto.routes.js

  controllers/
    govbrAuth.controller.js
    admin.controller.js
    ponto.controller.js

  services/
    govbrAuth.service.js
    adminAuthorization.service.js
    ponto.service.js
    funcionario.service.js

  middlewares/
    ensureAdminAuthenticated.js

  utils/
    pkce.util.js

  database/
    ...

  repositories/
    ...

## Responsabilidade das pastas

routes:
- Define URLs e chama controllers.
- Não colocar regra de negócio pesada aqui.

controllers:
- Recebe `req`, `res`, chama services e decide a resposta HTTP.

services:
- Contém regras de negócio e integrações externas.
- Exemplos: trocar code por token, buscar userinfo, verificar admin, validar marcação de ponto e registrar ponto.

middlewares:
- Protege rotas.
- Exemplo: garantir que admin está autenticado.

repositories:
- Acesso ao banco de dados.
- Controllers não devem consultar banco diretamente.

utils:
- Funções pequenas e reutilizáveis.
- Exemplos: PKCE, base64url e geração de texto seguro.

## Lógica do registro de ponto

Antes de registrar um ponto, o sistema deve validar:

- funcionário existe?
- funcionário está ativo?
- funcionário pode bater ponto?
- local é permitido?
- QR Code/rota é válido?
- já existe marcação no dia?
- é entrada ou saída?
- há duplicidade?

Depois disso:

- se for válido, registra no banco;
- se for inválido, bloqueia e retorna mensagem clara.

## Dashboard admin

O dashboard admin deve permitir ao administrador:

- visualizar registros de ponto;
- visualizar funcionários;
- gerenciar informações necessárias;
- acompanhar entradas e saídas;
- acessar dados administrativos.

Mas só deve abrir se existir:

req.session.admin

## Frase principal

O Gov.br autentica a identidade do usuário, mas a autorização de acesso ao dashboard é responsabilidade interna do Ponto Escolar.

Token válido não significa permissão administrativa. A permissão é decidida internamente pelo sistema.