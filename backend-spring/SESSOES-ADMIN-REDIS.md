# Sessao administrativa Spring em Redis

As instancias Spring compartilham OAuth/PKCE pendente, principal, contexto de
seguranca e CSRF pelo Spring Session Redis. O cookie continua sendo
`ATESTA_ADMIN_SESSION`, com Path=/, HttpOnly, SameSite=Lax, Secure controlado por
`ADMIN_SESSION_SECURE` (true por padrao) e Max-Age de
`ADMIN_SESSION_TTL_SECONDS` (7200 por padrao).

## Configuracao

- Exportar `REDIS_HOST` e `REDIS_PORT` (6379 por padrao). Host vazio impede iniciar.
- Exportar o mesmo `REDIS_NAMESPACE` em todas as instancias do mesmo ambiente.
  Usar valores distintos por ambiente. O padrao administrativo e `atestaponto:production`.
- As chaves ficam em `<REDIS_NAMESPACE>:admin:spring-session:sessions:<id>`.
  Nao usam os prefixos Express, QR, recuperacao ou rate limit.
- Quando necessario, fornecer `REDIS_USERNAME`, `REDIS_PASSWORD` e
  `REDIS_TLS=true` pelo ambiente. Nao versionar credenciais.
- Spring Session usa o cliente Jedis e banco Redis 0 por padrao. A configuracao
  padrao do Spring Data Redis continua disponivel para ajustes por ambiente.
- `REDIS_ENABLED=false` **nao** habilita sessao administrativa em memoria.
  Essa flag continua pertencendo aos fluxos existentes de ponto/QR/rate limit.

O filtro de sessao cobre somente `/auth/govbr/*`, `/admin/*` e `/api/admin/*`.
Nao envolve `/internal/**` nem os fluxos publicos de ponto. Cookies
`ponto_qr_acesso`, `ponto_recovery` e Express nao autenticam administradores.
Nao existe fallback administrativo em memoria, inclusive em desenvolvimento:
falhas de leitura/persistencia no Redis interrompem a requisicao.

## Ciclo de vida

O callback continua invalidando a sessao OAuth e criando um novo ID autenticado.
A validade absoluta `ADMIN_EXPIRES_AT` permanece independente do TTL de
inatividade no Redis. Logout invalida a sessao compartilhada e expira o cookie.
A autorizacao consulta os acessos persistidos a cada requisicao; quando a
validacao falha, inclusive apos revogacao, a sessao e excluida do Redis. As demais
instancias recusam esse ID na proxima requisicao. Nao ha cancelamento retroativo
de requisicoes que ja passaram pela autorizacao.

Sessoes antigas em memoria exigem novo login apos a troca. Durante a transicao,
nao misturar instancias antigas e novas no mesmo balanceamento. Manter versoes
compativeis das classes de sessao entre instancias: Spring Session usa
serializacao Java padrao e o Redis deve ser acessivel somente por clientes
confiaveis.

## Validacao isolada

Build: `./mvnw -DskipTests package` (nao inicia a aplicacao).
Homologacao do JAR real: `python3 scripts/check-admin-redis-sessions.py`.
O roteiro usa MySQL/Redis descartaveis, schema existente e Gov.br Python simulado,
sem carregar `.env` ou acessar mysql-dev/node-dev. Requer imagens locais
`mysql:8.4`, `redis:7-alpine` e o bcrypt Node ja instalado no gateway para a fixture
de credencial. Repeticao seletiva: `--only csrf,outage`.
Resultados em [HOMOLOGACAO-SESSOES-ADMIN-REDIS.md](HOMOLOGACAO-SESSOES-ADMIN-REDIS.md).
Conferir:

1. Login na instancia A e callback na B com o mesmo state/PKCE; ID antigo recusado.
2. Cookie com flags e TTL acima; sessao e CSRF reconhecidos em ambas as instancias.
3. POST administrativo sem CSRF recusado; logout exige origem configurada.
4. Expiracao absoluta e por inatividade; logout na B impede reutilizacao na A.
5. Acesso revogado recusa a requisicao, remove a chave e impede reutilizacao na A.
6. Somente cookies QR/recuperacao/Express nao concedem acesso administrativo.
7. Redis interrompido impede uso da sessao e novo login, sem fallback em memoria.
8. Cookies administrativos em `/internal/**` nao provocam leitura no Redis de sessao.

Validado em 18/10/2026: build Java 21 aprovado e 46 assercoes HTTP/Redis aprovadas
em uma checagem temporaria fora do repositorio, usando duas instancias Spring,
as configuracoes/controllers administrativos reais e servicos de identidade e
acesso simulados. Redis 7 descartavel, sem persistencia, removido ao final; zero
conexoes com banco real. Incluiu indisponibilidade do Redis com cookie Secure
habilitado. Nao valida o provedor Gov.br real, SQL de revogacao nem carga.

A homologacao posterior do JAR real, registrada no relatorio acima, aprovou 82
verificacoes e inclui SQL de revogacao no MySQL temporario, reinicio das
instancias, HMAC interno e indisponibilidade/perda de chaves Redis. Nao exigiu
correcoes adicionais no codigo de producao.

Referencias: [configuracao Redis do Spring Session 3.5](https://docs.spring.io/spring-session/reference/3.5/configuration/redis.html)
e [EnableRedisHttpSession](https://docs.spring.io/spring-session/docs/3.5.x/api/org/springframework/session/data/redis/config/annotation/web/http/EnableRedisHttpSession.html).
