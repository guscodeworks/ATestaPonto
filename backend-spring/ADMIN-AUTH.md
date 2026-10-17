# Autenticação administrativa pública

O Spring executa OAuth e mantém sua própria sessão, sem chamadas ao gateway.
O cadastro e os acessos continuam em JDBC, no schema existente.

Rotas:

- `GET /auth/govbr/login`: Authorization Code, state e PKCE S256.
- `GET /auth/govbr/callback`: consome state/verifier uma vez, troca code no
  servidor, consulta userinfo e exige administrativo ativo e acesso vigente.
  Sucesso redireciona para `/admin/dashboard`.
- `POST /auth/govbr/logout`: exige Origin ou Referer da origem configurada do
  callback; invalida sessão/cookie e redireciona para o logout configurado ou `/`.
- `GET /auth/govbr/start` e `/admin/login`: aliases de início do fluxo.

Configure pelo ambiente `GOVBR_AUTHORIZE_URL`, `GOVBR_TOKEN_URL`,
`GOVBR_USERINFO_URL`, `GOVBR_CLIENT_ID`, `GOVBR_CLIENT_SECRET`,
`GOVBR_REDIRECT_URI` e, opcionalmente, `GOVBR_LOGOUT_URL`.
O redirect URI deve terminar em `/auth/govbr/callback`, sem query.
O simulador existente pode fornecer authorize/token/userinfo em desenvolvimento;
ele não fornece autorização administrativa nem recebe a sessão da aplicação.

`ADMIN_SESSION_TTL_SECONDS` tem padrão 7200. A sessão expira de forma absoluta,
mesmo com atividade. State/verifier expiram em cinco minutos. O cookie próprio
`ATESTA_ADMIN_SESSION` usa Path=/, HttpOnly e SameSite=Lax. Secure é habilitado
por padrão; somente para desenvolvimento HTTP, use `ADMIN_SESSION_SECURE=false`.
Em produção mantenha Secure=true e todas as URLs do provedor em HTTPS.

A sessão usa o armazenamento do container Servlet e não compartilha cookies ou
serialização com Express. Reiniciar o Spring encerra sessões; múltiplas instâncias
exigirão uma solução de sessão compartilhada antes de uso nessa topologia.
Identidade e acessos são revalidados em cada requisição autenticada; falhas de
consulta e contextos inválidos invalidam a sessão e negam acesso.

O gateway e as páginas administrativas existentes não foram migrados. O Spring
preserva o redirect para o dashboard, mas não fornece sua página nem autentica o
dashboard Express com seu cookie. As rotas `/admin/**` e `/api/admin/**` no Spring
exigem sessão administrativa; capacidade e território ainda precisam ser
aplicados a cada operação pública de domínio que venha a ser migrada na próxima
PR. Esta entrega não comprova autorização territorial por recurso e não cria
endpoints artificiais para simular essa cobertura.

As rotas `/internal/**` continuam privadas, com HMAC, timestamp, request ID e
anti-replay obrigatórios; cookies não as autenticam. Não publique a porta inteira
do Spring para habilitar o login: a entrada pública deve encaminhar somente as
rotas públicas autorizadas e bloquear `/internal` e seus subcaminhos. Nenhuma
configuração de rede ou publicação foi alterada nesta etapa.

Não habilite logs de corpos, Authorization, Cookie ou Set-Cookie. Access logs
não devem registrar a query do callback, que contém o authorization code.
Tokens do provedor são usados apenas durante a troca e a consulta de userinfo;
não são colocados na sessão, resposta ou principal Spring Security.

## Validação isolada

Validação concluída em 15/10/2026: compilação e empacotamento aprovados com Java
21.0.12.1 (bytecode 65), além de 56 verificações HTTP/integradas aprovadas com
simulador Gov.br e MySQL 8.4 temporário. Os recursos temporários foram removidos;
`mysql-dev`, `node-dev` e `.env` foram preservados. Estes resultados pertencem à
execução já concluída; os testes não foram repetidos na finalização desta PR.

Com Java 21, Docker, Node e as dependências já instaladas do simulador:

```sh
cd backend-spring
./mvnw -DskipTests package
python3 scripts/check-admin-auth.py
```

O script cria seu próprio container MySQL 8.4, usa o schema canônico e dados
fictícios, e inicia Spring/simulador em portas locais temporárias. Não carrega
`.env`; verifica sua integridade e preserva `mysql-dev`/`node-dev`. Remove seus
processos, container e diretório temporário ao terminar, inclusive após falha.
Exige que os dois containers de desenvolvimento existam para conferir sua
preservação. Não conecta ao banco de desenvolvimento.

As verificações cobrem login, sessão, PKCE/state, CSRF/logout, identidade/acessos
revogados, vigência JDBC, perfis/territórios inválidos, cookies e HMAC/anti-replay.
Acesso territorial por recurso público ainda não pode ser validado: não há
operações públicas de domínio nesta fase. A sessão de uma escola não permite
chamar nem a própria escola nem outra escola em `/internal/**` sem HMAC.
