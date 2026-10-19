# Homologacao do runtime Spring independente

Data UTC: 2026-10-19T01:28:56.276727+00:00

Branch: `feat/spring-standalone-runtime`.
Base Git: `effee835af1a9564912835cc1363333fd391cae6`.
Imagem testada: `sha256:25d798676184c8526b6f01ca5e9b2a9cfbd41329ac98cae334c1397f89a1eae3`.

Runtime: **APROVADO**. Homologacao global: **BLOQUEADO** pelos fluxos visuais.

A publicacao da PR do runtime e de `/ready` foi autorizada separadamente apos
essas rodadas, mantendo as pendencias visuais, OAuth real, SMTP e TLS/proxy.
Os registros abaixo de "sem commit/push/PR" descrevem as instrucoes das etapas
anteriores. Esta publicacao nao aprova os fluxos pendentes nem autoriza merge/deploy.

## Atualizacao: prontidao MySQL e Redis

Data UTC: 2026-10-19T02:38:24Z.

Resultado: **APROVADO** nos tres cenarios solicitados, com HTTP e servicos reais.
Nao havia rota de prontidao adequada. Foi adicionado `GET /ready`, que reutiliza
o `SELECT 1` somente leitura e faz `PING` pela conexao Redis das sessoes, com a
configuracao existente de autenticacao/TLS/timeouts. O corpo contem somente
`{"status":"UP"}` ou `{"status":"DOWN"}`, com `Cache-Control: no-store`.
Nenhuma senha, token, endereco de conexao ou excecao e retornado.

`GET /health` nao foi alterado. O healthcheck Docker agora consulta `/ready`.

Imagem aprovada: `atestaponto-spring-standalone:readiness`,
`sha256:9f9bbb99026adb7fa46bf96d361e20f7da35aec26c569c5b26e5884da1d08eb6`.
Compilacao/empacotamento Java 21: **APROVADO**, com 179 fontes Java.

| Cenario | GET /ready | Corpo | GET /health preservado | Comando do healthcheck Docker |
|---|---|---|---|---|
| MySQL e Redis disponiveis | 200 | `{"status":"UP"}` | 200 / UP / connected | Exit 0 |
| MySQL indisponivel | 503 | `{"status":"DOWN"}` | 503 / DOWN / unavailable | Exit diferente de 0 |
| Redis indisponivel | 503 | `{"status":"DOWN"}` | 200 / UP / connected | Exit diferente de 0 |

- Testes criados em `backend-spring/scripts/check-readiness.py`. Para repetir,
  executar da raiz do repositorio:

  ```sh
  docker build -t atestaponto-spring-standalone:readiness backend-spring
  python3 backend-spring/scripts/check-readiness.py
  ```

- Foram executados somente os tres casos de prontidao, a compatibilidade de
  `/health`, o comando real do healthcheck e a recuperacao entre cenarios.
  Nao se aguardou o ciclo completo de retries para observar `unhealthy`: o
  comando foi executado diretamente no container e seu exit code foi conferido.
- Spring recuperou prontidao apos religar MySQL/Redis, sem reiniciar a aplicacao.
- O Compose temporario usou projeto exclusivo, porta livre em loopback e bancos
  sem portas publicadas. Nao houve importacao de schema, dados reais, uso de
  Node.js, Express ou ATestaID, nem leitura de configuracao de um `.env` real.
- Segredos de teste foram gerados exclusivamente em arquivo temporario protegido
  e removido. Containers, redes e volumes da rodada foram removidos ao final.
- Snapshots confirmaram `.env` e containers existentes, incluindo `mysql-dev` e
  `node-dev`, preservados: IDs, estado, portas, configuracao, redes e reinicios.
- Sem bloqueios nesta alteracao. Os bloqueios visuais e limites de OAuth/SMTP/TLS
  da homologacao anterior permanecem; esses fluxos nao foram reexecutados.
- Sem commit, push, merge ou deploy, conforme a instrucao desta etapa.

As secoes abaixo registram a rodada anterior, na imagem anterior a `/ready`.

## Compilacao e imagem

- **APROVADO**: compilacao limpa real dos 177 arquivos Java, em Maven 3.9.11 e
  Java 21, executada offline em container descartavel e sem Node.js.
- **APROVADO**: `docker build` com tag `atestaponto-spring-standalone:homologation`.
  O builder reutilizou camadas; a compilacao limpa foi executada separadamente.
  O host nao possui Buildx; foi usado o builder legado, sem instalar componentes.
- JAR recompilado: SHA-256
  `b6f91861f175f5955e7283a73669d0e4ec8e0d16f84780a3ec4adf7397e7d7ee`,
  identico ao artefato da imagem validado na preparacao anterior.
- Maven executou `clean package` com `-DskipTests` e timestamp fixo. Nao ha fontes
  unitarias em `src/test`; os testes abaixo usaram HTTP, Docker, MySQL e Redis reais.

## Evidencias

| Resultado | Verificacao |
|---|---|
| APROVADO | Branch correta |
| APROVADO | Compose valido com valores ficticios e segredos temporarios |
| APROVADO | Compose recusa segredo ausente: DB_PASSWORD |
| APROVADO | Compose recusa segredo ausente: MYSQL_ROOT_PASSWORD |
| APROVADO | Compose recusa segredo ausente: JWT_SECRET |
| APROVADO | Compose recusa segredo ausente: SESSION_SECRET |
| APROVADO | Compose recusa segredo ausente: INTERNAL_API_SHARED_KEY |
| APROVADO | Compose recusa segredo ausente: GOVBR_CLIENT_SECRET |
| APROVADO | MySQL SELECT 1 e Redis PING disponiveis |
| APROVADO | MySQL inicialmente vazio, sem migrations automaticas |
| APROVADO | Schema canonico apenas no banco descartavel e dados ficticios provisionados |
| APROVADO | Startup e /health HTTP 200 UP com MySQL proprio |
| APROVADO | UID/GID 10001, filesystem somente leitura e capabilities removidas |
| APROVADO | PID 1 configurado como java -jar, sem processo Node.js |
| APROVADO | Java 21 em execucao; node e npm ausentes na imagem |
| APROVADO | Spring conectado somente as redes exclusivas do projeto temporario |
| APROVADO | Rede de dados interna com apenas Spring/MySQL/Redis temporarios |
| APROVADO | mysql sem portas publicadas e sem rede externa |
| APROVADO | redis sem portas publicadas e sem rede externa |
| APROVADO | Unica porta publicada: Spring em loopback e porta livre temporaria |
| APROVADO | Nenhum volume dos ambientes existentes montado no Spring |
| APROVADO | Spring responde /health dentro do container sem rede externa nem gateway Express |
| APROVADO | Gateway Express nao resolvido na rede isolada |
| APROVADO | Leitura HMAC de dados ficticios dentro do container sem rede de saida nem Express |
| APROVADO | Leitura de dados ficticios via HMAC pela porta loopback, sem Node/Express |
| APROVADO | Replay HMAC recusado |
| APROVADO | Rota interna sem HMAC recusada |
| APROVADO | HMAC expirado recusado |
| APROVADO | Assinatura HMAC invalida recusada |
| APROVADO | IDs e escopo global enviados pelo navegador nao autorizam acesso |
| APROVADO | API de ponto sem token recusada |
| APROVADO | Token de ponto invalido recusado |
| APROVADO | Origem publica nao autorizada recusada |
| APROVADO | Inicio OAuth cria sessao Redis e cookie HttpOnly/SameSite=Lax em HTTP local explicito |
| APROVADO | Sessao administrativa persistida no Redis com TTL |
| APROVADO | Reinicio do Spring preserva a sessao no Redis |
| APROVADO | Sessao OAuth pendente nao concede autorizacao apos reinicio |
| APROVADO | Reinicio MySQL/Redis preserva dados ficticios nos volumes exclusivos |
| APROVADO | Redis indisponivel: login retorna 503 e nao usa fallback local |
| APROVADO | Redis indisponivel: cookie nao concede acesso administrativo |
| LIMITACAO CONFIRMADA | /health verifica apenas MySQL e permanece 200 durante queda do Redis |
| APROVADO | MySQL indisponivel: /health HTTP 503 DOWN |
| APROVADO | MySQL indisponivel: consulta de dominio falha sem dados liberados |
| APROVADO | Recuperacao do MySQL restaura /health sem reiniciar Spring |
| APROVADO | Runtime recusa startup com segredo vazio: INTERNAL_API_SHARED_KEY |
| APROVADO | Logs de startup negativo nao expoem segredos: INTERNAL_API_SHARED_KEY |
| APROVADO | Runtime recusa startup com segredo vazio: JWT_SECRET |
| APROVADO | Logs de startup negativo nao expoem segredos: JWT_SECRET |
| APROVADO | Runtime recusa startup com segredo vazio: SESSION_SECRET |
| APROVADO | Logs de startup negativo nao expoem segredos: SESSION_SECRET |
| APROVADO | Logs Spring de startup/outages sem segredos temporarios |
| APROVADO | Encerramento por SIGTERM sem SIGKILL e dentro do prazo |
| APROVADO | Spring registra encerramento HTTP graceful |
| APROVADO | Containers, redes e volumes exclusivos removidos ao final |
| APROVADO | Containers existentes: IDs, estado, portas, configuracao, redes e reinicios preservados |
| APROVADO | Arquivos rastreados e arquivos .env existentes sem alteracoes |
| APROVADO | Conferencia adicional apos limpeza: nenhuma rede, volume ou container das duas rodadas permanece |

## Fluxos visuais

| Resultado | Fluxo | Motivo |
|---|---|---|
| BLOQUEADO | Login, dashboard e navegacao administrativa em navegador | Dependem de entregas/validacao do Guilherme e de assets ainda servidos pelo gateway. Nao houve homologacao visual. |
| BLOQUEADO | Telas de escolas, funcionarios, ponto, QR e relatorios | Frontend nao alterado; layout, assets e contratos visuais dependentes do Guilherme nao foram aprovados. |

## Limites e decisao de publicacao

- Nao foi executado Node.js nem iniciado Express/ATestaID pela homologacao. O `node-dev` preexistente foi preservado; a leitura HMAC foi exercitada sem rede de saida e sem DNS do gateway.
- O schema canonico foi apenas lido do repositorio e aplicado exclusivamente no MySQL descartavel. Dados de negocio eram ficticios. Nenhum banco existente foi consultado ou escrito.
- OAuth usou endpoints `.invalid`: inicio, cookie e persistencia Redis foram exercitados; login real com provedor, callback autenticado e fluxos visuais nao foram homologados.
- SMTP ficou desligado. TLS/proxy, certificados e Redis gerenciado com senha/TLS nao foram provisionados ou aprovados.
- Na rodada anterior, o healthcheck consultava apenas MySQL. A atualizacao acima substitui a sondagem Docker por `/ready` (MySQL e Redis); `/health` mantem seu contrato anterior.
- Na primeira rodada, desconectar a rede de saida removeu o acesso a porta publicada pelo Docker (connection refused). A sondagem externa foi inconclusiva; na segunda rodada, a verificacao sem saida foi feita de dentro do container, preservando a evidencia desta limitacao de transporte. Nenhum codigo do runtime foi alterado para os testes.
- A infraestrutura foi temporaria, com MySQL/Redis em redes privadas e sem portas publicadas; apenas uma porta Spring livre em loopback foi usada e liberada.
- Sem merge, deploy ou force push. Commit/push/PR nao executados: a autorizacao era condicionada a tudo aprovado e ha fluxos BLOQUEADOS.
