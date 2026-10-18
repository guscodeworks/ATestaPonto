# Relatórios e dashboard administrativos no Spring

Os seis GETs abaixo usam a sessão administrativa Gov.br já existente no Spring,
com revalidação do cadastro e dos acessos ativos a cada requisição.

| URL | Capacidade | Dados públicos |
| --- | --- | --- |
| `/api/admin/pontos/hoje` | `ponto.hoje.visualizar` | `data_referencia`, `resumo`, `presentes`, `ausentes` |
| `/api/admin/pontos/relatorio` | `relatorio.visualizar` | `data_referencia`, `resumo`, `items` |
| `/api/admin/pontos/relatorio/semanal` | `relatorio.hierarquico.visualizar` | Datas, resumo e sete dias do serviço semanal existente |
| `/api/admin/pontos/relatorio/hierarquia` | `relatorio.hierarquico.visualizar` | `data_referencia`, `resumo`, `diretorias` com escolas agregadas |
| `/api/admin/pontos/resumo` | `ponto.resumo.visualizar` | `data_referencia`, `resumo` |
| `/api/admin/auth/me` | Sessão administrativa ativa | `admin`, `capacidades` |

As respostas de sucesso mantêm `{ "success": true, "data": ... }` e aceitam
barra final. O dia padrão usa `America/Sao_Paulo`; resumo ignora `data`.
Hierarquia aceita `diretoria_ensino_id` e `unidade_escolar_id` como IDs positivos
seguros. Os serviços existentes são chamados diretamente, sem HTTP interno.

A capacidade filtra os acessos antes de resolver o território. SEDUC pode
consultar agregados globais, mas não recebe capacidade para relatórios nominais.
Quando há perfis acumulados, nominal usa somente o território dos acessos que
autorizam essa consulta. Escopo vazio não retorna pessoas nem vira global.
CPF continua mascarado; os agregados não incluem registros nominais.

`auth/me` retorna somente `authProvider`, `id`, `sub`, `name`, `nome`, `email`
e `loginAt` em `admin`. Nome/e-mail são os do cadastro no momento do login;
capacidades são recalculadas pelos acessos revalidados, na ordem do Express.
Sessão ausente/expirada retorna 401; cadastro inativo ou sem acessos retorna 403.

A auditoria `relatorio_consultado` ocorre após sucesso de diário e hierarquia,
com administrador, IP, mensagem e metadados originais. Hoje, semanal e resumo
não criam esse evento. Respostas usam `Cache-Control: no-store`.

## Transição

O gateway Express, suas rotas, cookies, clientes HMAC e `/internal/**` continuam
presentes. Este código não altera roteamento de infraestrutura ou deploy.
A sessão Spring (`ATESTA_ADMIN_SESSION`) permanece independente de `connect.sid`;
cookies Express não autenticam diretamente os endpoints Spring.

As cotas dos relatórios são `ip-abuse`, `sensitive` e `sensitive-resource`,
com janela de 15 minutos e limite sensível 40, incluindo cabeçalhos e 429.
Em Redis, namespace, chaves HMAC e formato dos contadores são compatíveis com
o Express. Configure os mesmos `SESSION_SECRET`, `REDIS_NAMESPACE`, `NODE_ENV`
e Redis já usados pelo gateway. `RATE_LIMIT_IP_MAX` mantém padrão 2000.
`SESSION_SECRET` é obrigatório em produção ou com Redis habilitado;
indisponibilidade do armazenamento retorna 503, sem fallback para memória.
Somente desenvolvimento sem Redis admite contadores locais e usa a chave
interna como alternativa quando `SESSION_SECRET` estiver ausente.
O IP da cota segue o último salto de `X-Forwarded-For`, como `trust proxy=1`
no Express; mantenha a mesma fronteira de proxy confiável na infraestrutura.
`auth/me` não consome a cota sensível de relatórios.

## Validação realizada

- `./mvnw -o compile`: passou com Java 21, sem iniciar a aplicação.
- Harness temporário em `/tmp`, sem novos testes no repositório: 224 assertions
  passaram, cobrindo projeções JSON, CPF mascarado, horários ausentes, datas,
  semana futura, filtros, território acumulado/vazio, 401/403/429/502/503,
  auditoria, identidade da sessão, IPv4/IPv6 e compatibilidade das chaves de cota.
- Todas as 64 combinações dos seis perfis foram comparadas com a função real
  de capacidades do Express, incluindo a ordem pública.
- `git diff --check`: passou.

Na validação inicial isolada não houve conexão ao banco, login ou startup.
A homologação HTTP posterior autorizada **PASSOU**, com Spring real, Java 21,
MySQL 8.4 e Redis 7 temporários e Gov.br simulado: 266 requisições públicas
verificadas, incluindo sessões, contratos, escopos, datas, agregados, auditoria,
cotas e HMAC. Somente os grupos de datas e território precisaram de reexecução
após correções no harness. Consulte [HOMOLOGACAO-RELATORIOS.md](HOMOLOGACAO-RELATORIOS.md)
para resultados, histórico e reprodução com `scripts/check-public-reports.py`.
`mysql-dev`, `node-dev` e `.env` foram preservados, e os recursos temporários
foram removidos. Sem commit, merge ou deploy; ambiente real não foi exercitado.

## Integração após a PR #162

`origin/develop` no commit `90ff8b51f98aae737049c2290704d0939fb4bb71`
foi incorporada à branch de relatórios por merge normal, sem rebase.
Os conflitos em `AdminSecurityConfiguration` e `PublicAdminRateLimit` foram
reconciliados mantendo os dois conjuntos de APIs e filtros. A revalidação
continua após `PublicAccessApiFilter`; relatórios mantêm sua autorização própria.
A lista de APIs protegidas por sessão/CSRF contém acessos, cargos, QR e relatórios.

O contador Redis permanece único: mesmos nomes, digest HMAC, janela, TTL e cotas
para acessos/QR e relatórios. O fallback da chave interna fica restrito a
ambiente local sem Redis; produção/Redis exige `SESSION_SECRET`, como na #163.
Uma regressão HTTP adicional comprova que 40 consultas de relatório consomem
na mesma instância a cota que protege `POST /api/admin/qr-tokens`.

Regressão focada da integração: **PASSOU, 191 verificações; nenhuma falha ou
bloqueio**. Build Java 21 com `./mvnw -o -DskipTests package` aprovado.

- Relatórios: `python3 backend-spring/scripts/check-public-reports.py --only contratos,territorio,sessao,limites` — 33 verificações, 158 requisições públicas.
- Acessos/QR: `python3 backend-spring/scripts/check-public-access-qr.py --only contracts,rbac,csrf,sessions,qr,abuse` — 158 verificações.

Foram usados Spring real, Gov.br simulado e MySQL/Redis temporários isolados.
Autenticação, capacidades, território, relatórios, CSRF, QR e cotas Redis
passaram. `mysql-dev`, `node-dev` e `.env` permaneceram intactos; os recursos
temporários foram removidos. Os relatórios de homologação preservam as rodadas.
Express, `/internal/**` e os scripts existentes de acessos/QR não foram alterados.
Não foram repetidas auditorias gerais ou as suítes de concorrência/rollback.
Esta integração não faz merge da PR #163 em `develop` nem aciona deploy manual.

## Arquivos da mudança

Sob `src/main/java/br/com/atestaponto/`:

- `auth/admin/config/AdminSecurityConfiguration.java`
- `auth/admin/config/PublicReportApiFilter.java`
- `auth/admin/controller/PublicAdminAuthController.java`
- `auth/admin/controller/PublicAdminSessionController.java`
- `auth/admin/service/AdminCapabilities.java`
- `auth/admin/service/PublicAdminAuthorization.java`
- `auth/admin/service/PublicAdminRateLimit.java`
- `auth/admin/service/PublicReportAuthorization.java`
- `report/controller/PublicReportController.java`
- `report/controller/PublicReportExceptionHandler.java`
- `report/service/PublicReportService.java`

Este documento: `backend-spring/RELATORIOS-PUBLICOS.md`.
