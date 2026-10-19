# Redis no Spring

Sessoes administrativas (Spring Session) e o cliente Jedis compartilhado por QR
escolar, sessoes de ponto e rate limiting usam as mesmas variaveis de conexao:

| Variavel | Uso | Padrao |
| --- | --- | --- |
| `REDIS_HOST` | Host Redis; obrigatorio para sessoes administrativas | sem padrao |
| `REDIS_PORT` | Porta TCP ou TLS | `6379` |
| `REDIS_USERNAME` | Usuario ACL opcional | vazio (usuario default) |
| `REDIS_PASSWORD` | Senha opcional, preservada sem trim | vazio (sem AUTH) |
| `REDIS_TLS` | Habilita TLS em ambos os clientes | `false` |
| `REDIS_ENABLED` | Habilita o cliente compartilhado; nao desabilita Spring Session | `false` |
| `REDIS_NAMESPACE` | Prefixo existente das chaves; mantenha o valor do ambiente | Spring Session: `atestaponto:production`; QR/ponto/cotas: `atestaponto:production` em producao, `atestaponto:local` em desenvolvimento |

Para Redis local sem autenticacao, deixe usuario/senha ausentes e TLS desabilitado.
Para Redis protegido, injete senha e, quando houver ACL, usuario pelo ambiente do
processo/gerenciador de segredos. Nao use credenciais em URL, Git ou logs.
Nao ha alteracao de namespaces, TTLs, timeouts ou regras de fallback/falha fechada.

Com `REDIS_TLS=true`, o certificado deve ser valido para `REDIS_HOST` e ter cadeia
confiavel pela JVM. Para CA privada, configure o truststore padrao JSSE da JVM
(`javax.net.ssl.trustStore` e `javax.net.ssl.trustStorePassword`) usando o mecanismo
seguro de configuracao do ambiente. Nunca desabilite a verificacao de certificados
ou hostname. TLS nao implica mTLS; autenticacao por certificado cliente nao faz
parte desta alteracao.

Validacao isolada (Java 21, Docker com imagem local `redis:7-alpine`, OpenSSL e
keytool; sem Node, MySQL, startup da aplicacao ou leitura de `.env`):

```sh
cd backend-spring
./mvnw -o -DskipTests package
python3 scripts/check-redis-secure.py
```

O script usa somente containers Redis descartaveis, certificados/senhas aleatorios
temporarios e os beans reais de Spring Session, QR e rate limiting. Verifica sem
senha/TLS, senha, usuario ACL, senha+TLS, senha incorreta, CA nao confiavel,
hostname incorreto e indisponibilidade,
incluindo namespaces, TTL de sessao, revogacao QR e cotas. Remove os containers e
arquivos temporarios ao terminar. Falha de pre-requisito/cenario incompleto aparece
como `BLOQUEADO`; uma assercao reprovada aparece como `FAIL` no processo Java.

## Resultado da validacao — 2026-10-19

Branch `feat/spring-redis-secure`; Java 21.0.12.1; imagem local `redis:7-alpine`.
Comandos executados: os dois comandos acima. Build offline: **PASSOU**.
Somente o teste Redis foi executado, com beans reais e fixtures ficticias isoladas.

| Cenario | Sessoes administrativas | QR escolar | Rate limiting |
| --- | --- | --- | --- |
| Sem senha e sem TLS | PASSOU | PASSOU | PASSOU |
| Com senha | PASSOU | PASSOU | PASSOU |
| Usuario ACL e senha | PASSOU | PASSOU | PASSOU |
| Com TLS e senha | PASSOU | PASSOU | PASSOU |
| Senha incorreta (senha, ACL e TLS) | PASSOU: rejeitada | PASSOU: rejeitada | PASSOU: rejeitada |
| Usuario ACL invalido | PASSOU: rejeitado | PASSOU: rejeitado | PASSOU: rejeitado |
| TLS com CA nao confiavel | PASSOU: rejeitado | PASSOU: rejeitado | PASSOU: rejeitado |
| TLS com hostname incorreto | PASSOU: rejeitado | PASSOU: rejeitado | PASSOU: rejeitado |
| Redis desligado (sem senha, senha, ACL e TLS) | PASSOU: falha fechada | PASSOU: falha fechada | PASSOU: falha fechada |

Nos cenarios positivos foram verificadas persistencia/leitura/exclusao de sessao,
namespace e TTL administrativo, geracao e revogacao atomica do QR, incremento,
consulta, desconto e TTL de cotas. Nas falhas, leitura e gravacao de sessao,
leitura e geracao de QR, incremento e consulta de cotas levantaram excecoes Redis
especificas; nenhum fallback local permitiu concluir essas operacoes.
O teste foi reforcado para nao aceitar uma excecao arbitraria como prova de bloqueio.

A revisao dos consumidores confirmou que o filtro administrativo de cotas retorna
503 sem prosseguir a cadeia quando o Redis falha, e que QR propaga falhas sem
retornar contexto autorizado. A cadeia HTTP completa, Gov.br e autorizacao
territorial nao foram exercitados: esta validacao comprova o comportamento dos
clientes/beans Redis, nao uma homologacao HTTP de ponta a ponta.

**FALHOU: nenhum cenario. BLOQUEADO: nenhum cenario solicitado.**
**Limpeza: PASSOU. Preservacao dos ambientes existentes: PASSOU.**
Todos os containers Redis e arquivos/certificados temporarios foram removidos.
IDs, estado, horario de inicio e contagem de reinicios dos containers existentes
foram comparados antes/depois e permaneceram identicos. Nenhum Node, MySQL ou
arquivo `.env` foi usado nos testes. Sem commit, push, merge ou deploy.

## Validacao HTTP com Redis autenticado

Complementa a rodada de beans acima com o JAR Spring completo e JDBC/MySQL 8.4
temporario. Gov.br e simulado por servidor Python local com Authorization Code,
state e PKCE; nao inicia Express nem usa Gov.br real. Redis recebe senha aleatoria
via arquivo temporario privado; a mesma senha chega ao Spring pelo ambiente e ao
redis-cli pelo ambiente, sem credenciais na linha de comando.

```sh
cd backend-spring
./mvnw -o -DskipTests package
python3 scripts/check-public-access-qr.py --redis-auth --only sessions,qr,abuse
```

Para repetir uma falha, mantenha `--redis-auth` e selecione apenas o grupo afetado
em `--only`. O modo autenticado registra os resultados neste arquivo. As fixtures
e verificacoes de limpeza/preservacao sempre executam. Os testes de conexao e TLS
anteriores nao sao repetidos; esta rodada HTTP usa Redis com senha sem TLS.

Escopo: sessao administrativa persistida com TTL, recusas de acesso e logout,
geracao/consulta/regeneracao/resolucao de QR, cota sensivel compartilhada com 429
e Retry-After, bloqueio HTTP durante queda do Redis e retomada apos recuperacao.
O resolvedor interno de QR e chamado com HMAC valido para isolar sua dependencia
do Redis da dependencia da sessao administrativa. Todos os dados sao ficticios;
escritas SQL e pausas de Redis atingem exclusivamente containers temporarios.

## HTTP Redis com senha — Rodada UTC 2026-10-19T22:45:38.457939+00:00

Grupos: sessions,qr,abuse.

| Resultado | Grupo | Cenario |
|---|---|---|
| BLOQUEADO | infra | AssertionError: Spring encerrou no startup |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Somente MySQL/Redis temporarios removidos; Spring/cliente SQL/Gov.br encerrados |

Totais: PASSOU=3; FALHOU=0; BLOQUEADO=1.

## HTTP Redis com senha — Rodada UTC 2026-10-19T22:46:40.225839+00:00

Grupos: sessions,qr,abuse.

| Resultado | Grupo | Cenario |
|---|---|---|
| PASSOU | infra | Java 21 + JAR Spring real + MySQL 8.4 tmpfs + Redis 7 temporarios + Gov.br simulado |
| PASSOU | infra | Authorization Code/PKCE real no Spring e renovacao de sessao dos perfis ficticios |
| PASSOU | sessions | Sessao HTTP autenticada persistida no namespace administrativo com TTL |
| PASSOU | sessions | Login fail-closed: sem acesso/futuro/inativo/expirado 9 |
| PASSOU | sessions | Login fail-closed: sem acesso/futuro/inativo/expirado 10 |
| PASSOU | sessions | Login fail-closed: sem acesso/futuro/inativo/expirado 11 |
| PASSOU | sessions | Login fail-closed: sem acesso/futuro/inativo/expirado 12 |
| PASSOU | sessions | OAuth state adulterado invalida sessao |
| PASSOU | sessions | Sessao revalida identidade, status e vigencia persistidos |
| PASSOU | sessions | Sessao revalida identidade, status e vigencia persistidos |
| PASSOU | sessions | Sessao revalida identidade, status e vigencia persistidos |
| PASSOU | sessions | Logout de origem valida |
| PASSOU | sessions | Replay do cookie apos logout nao recupera acesso |
| PASSOU | qr | QR atual ausente retorna null |
| PASSOU | qr | QR gerado: URL e unidade publicas |
| PASSOU | qr | QR atual consistente entre perfis da mesma escola |
| PASSOU | qr | QR original valido no resolvedor real |
| PASSOU | qr | Regeneracao usa escola do acesso; body nao concede territorio |
| PASSOU | qr | QR antigo perde validade apos regeneracao |
| PASSOU | qr | Novo QR valido apos regeneracao |
| PASSOU | qr | Indice do token antigo removido atomicamente do Redis |
| PASSOU | qr | QR negado para perfil sem capacidade escolar 2 |
| PASSOU | qr | QR negado para perfil sem capacidade escolar 3 |
| PASSOU | qr | QR negado para perfil sem capacidade escolar 4 |
| PASSOU | qr | QR negado para perfil sem capacidade escolar 7 |
| PASSOU | qr | QR negado para perfil sem capacidade escolar 13 |
| PASSOU | qr | QR ambiguo exige resolucao explicita |
| PASSOU | qr | QR ambiguo exige resolucao explicita |
| PASSOU | qr | QR nao combina capacidade escolar e DRE de outro acesso |
| PASSOU | abuse | Cota sensivel de 40 compartilhada entre acesso e QR, inclusive negacoes |
| PASSOU | abuse | Headers de limite e Retry-After preservados |
| PASSOU | abuse | Cotas reais no Redis sem identidade em claro nas chaves |
| PASSOU | abuse | Resolvedor QR disponivel antes da queda |
| PASSOU | abuse | Redis indisponivel falha fechado em producao |
| PASSOU | abuse | Redis indisponivel bloqueia GET /api/admin/auth/me sem sessao alternativa (HTTP 500) |
| PASSOU | abuse | Redis indisponivel bloqueia GET /auth/govbr/login sem sessao alternativa (HTTP 500) |
| PASSOU | abuse | Redis indisponivel bloqueia GET /api/admin/qr-tokens sem sessao alternativa (HTTP 503) |
| PASSOU | abuse | Redis indisponivel bloqueia POST /api/admin/qr-tokens sem sessao alternativa (HTTP 503) |
| PASSOU | abuse | Resolvedor QR com HMAC valido nao retorna unidade durante queda do Redis |
| PASSOU | abuse | Redis recuperado permite consultas sem fallback em memoria |
| PASSOU | abuse | Queda nao publica novo QR; sessao persistida e QR original retomados |
| PASSOU | audit | Logs sem chaves OAuth/HMAC/sessao ou tokens de QR |
| PASSOU | audit | Logs nao expoem CPF ou email ficticios em claro |
| PASSOU | audit | Auditoria sem CPF/email/token ou URL de QR |
| PASSOU | audit | Auditoria identifica operador e origem sem payload sensivel |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Somente MySQL/Redis temporarios removidos; Spring/cliente SQL/Gov.br encerrados |

Totais: PASSOU=48; FALHOU=0; BLOQUEADO=0.

### Conclusao da rodada HTTP

**PASSOU: 48 verificacoes. FALHOU: 0. BLOQUEADO: 0 na rodada final.**
Build Java 21 offline tambem passou. A tentativa anterior ficou BLOQUEADA por
`JWT_SECRET` ausente na fixture antiga; foi corrigida com chave ficticia aleatoria,
distinta de `SESSION_SECRET`, sem alteracao no codigo de producao. Como nenhum
fluxo HTTP havia iniciado, somente os mesmos tres grupos pendentes foram executados.

Na queda simulada por pausa exclusiva do Redis temporario: limitador retornou
503/`RATE_LIMIT_UNAVAILABLE`; sessao administrativa e inicio de login retornaram
500; consulta/geracao publica de QR retornaram 503; resolvedor QR interno com
HMAC valido retornou erro 5xx sem unidade. Nao houve resposta de sucesso nessas
operacoes nem cookie alternativo `JSESSIONID`. A recuperacao retomou sessoes
persistidas e o QR original, sem publicar novo QR durante a indisponibilidade.

Limitacoes: OAuth usa exclusivamente Gov.br Python local; HTTP local e Redis com
senha sem TLS nesta rodada. Nao foram repetidos conexao/TLS, nem homologados
Gov.br real, navegadores, multiplas instancias ou infraestrutura de producao.
Os status 500 das falhas de sessao refletem o tratamento atual; nao foi alterado
o contrato de erros. Logs passaram nas verificacoes de ausencia de segredos/dados
ficticios em claro. MySQL, Redis, Spring, simulador e arquivos temporarios foram
removidos; `.env`, `mysql-dev` e `node-dev` foram preservados.

## Conferencia para publicacao da PR

Branch `feat/spring-redis-secure`, destino `develop`. Diff revisado e limitado aos
cinco arquivos de configuracao, fixtures e documentacao desta tarefa. Nenhum
arquivo da PR #169, Node, `.env` ou infraestrutura foi incluido. Resultados
aprovados acima conferidos sem repetir testes. Bloqueio inicial de fixture
resolvido; nenhuma falha relevante de Redis pendente na rodada final.

Estado apenas registrado dos previews antigos, conforme exibido pelo GitHub:
`Vercel – atestaponto` e `Vercel – atestaponto-auth-simulator`: **FAILURE** tanto
no commit base `38d099b` quanto na [PR #169](https://github.com/guscodeworks/ATestaPonto/pull/169).
`Vercel Preview Comments` na PR #169: **SUCCESS**. Logs e causas desses previews
nao foram investigados, e nenhum preview foi reexecutado nesta tarefa.
