# APIs públicas de acessos, cargos e QR

Homologação real subsequente: [HOMOLOGACAO-ACESSOS-CARGOS-QR.md](HOMOLOGACAO-ACESSOS-CARGOS-QR.md).
Passaram 200 verificações distintas com MySQL 8.4 e Redis 7 descartáveis,
Gov.br simulado e HTTP direto no Spring. As limitações de banco simulado abaixo
descrevem a validação inicial e foram cobertas nessa rodada posterior.

Branch: `feat/spring-public-access-qr`, criada no checkout existente após fetch e
fast-forward de `develop` (já estava atualizado em `372a6fb`). Sem worktree,
alteração de schema de produção ou acesso ao banco de desenvolvimento. Express
preservado. A homologação usa bancos descartáveis; commit, push e PR são a etapa
de publicação autorizada, sem merge ou deploy.

## Contratos implementados

| Método | URL | Operação |
|---|---|---|
| GET / POST | `/api/admin/acessos` | Listagem paginada / concessão |
| GET | `/api/admin/acessos/meu` | Acessos próprios e escopo |
| GET | `/api/admin/acessos/capacidades` | Capacidades por perfil |
| GET | `/api/admin/acessos/opcoes-concessao` | Perfis e recursos concedíveis |
| GET | `/api/admin/acessos/{id}` | Consulta com ocultação de recurso fora do escopo |
| PATCH | `/api/admin/acessos/{id}/suspender` | Suspensão |
| PATCH | `/api/admin/acessos/{id}/reativar` | Reativação |
| PATCH | `/api/admin/acessos/{id}/revogar` | Revogação definitiva |
| GET | `/api/admin/cargos` | Lista direta `{id,nome,ativo}` |
| GET / POST | `/api/admin/qr-tokens` | QR atual / geração |

As rotas também aceitam barra final. A camada pública projeta o JSON do Express,
incluindo CPF mascarado, `acoes_permitidas`, paginação e detalhes de erro.
Services e repositories existentes são chamados em processo, sem HTTP interno.

Sucesso de acessos/QR usa `{success:true,data:...}`; concessão retorna 201 com
`data.acesso.criou_identidade`, enquanto os demais sucessos retornam 200.
Cargos retorna diretamente a lista `{id,nome,ativo}`, sem envelope. A listagem
de acessos contém `items` e `pagination:{page,limit,total}` (padrão 1/20, limite
máximo 100); cada item informa `acoes_permitidas`. Consulta individual retorna
`data.acesso`; acessos próprios omitem a identidade de terceiros. QR retorna
`data.qrCode`, que é `null` quando ausente ou `{unidade_escolar_id,url}`.

Erros públicos usam `{success:false,error:{code,message,details}}`, com detalhes
de validação por campo em 422; o limiter preserva seu erro sem `details`.
Sessão inválida retorna 401, capacidade/território insuficiente em mutações
retorna 403 e consulta individual inexistente/fora do escopo retorna o mesmo 404.
Consistência de perfil/período retorna 400; transição inválida/conflito retorna
409. QR ambíguo retorna 409 com `details.unidades_escolares_ids` ordenados.
Falha de serviço de cargos/QR retorna 502; cota excedida retorna 429 com
`Retry-After` e indisponibilidade da proteção retorna 503, sem liberar a operação.

## Matriz de autorização

| Perfil do acesso ativo | Acessos de terceiros | Perfis que pode conceder | Perfis que pode suspender/reativar/revogar | Território | QR |
|---|---|---|---|---|---|
| ADMIN_SEDUC | Listar/consultar/gerenciar | ADMIN_DIRETORIA, SECRETARIA, COORDENADOR | ADMIN_DIRETORIA, DIRETOR, VICE_DIRETOR, SECRETARIA, COORDENADOR | Global explícito | Não |
| ADMIN_DIRETORIA | Listar/consultar/gerenciar | DIRETOR, VICE_DIRETOR, SECRETARIA, COORDENADOR | DIRETOR, VICE_DIRETOR, SECRETARIA, COORDENADOR | Própria DRE e suas escolas | Não |
| DIRETOR / VICE_DIRETOR | Listar/consultar/gerenciar | SECRETARIA, COORDENADOR | SECRETARIA, COORDENADOR | Própria escola | Visualizar/gerar |
| SECRETARIA | Sem gestão de terceiros | Nenhum | Nenhum | Própria escola | Visualizar/gerar |
| COORDENADOR | Sem gestão de terceiros | Nenhum | Nenhum | Própria escola | Não |

Todos os perfis válidos podem consultar cargos, seus próprios acessos e a tabela
de capacidades. Opções de concessão exigem `acesso.conceder` e só incluem os
pares perfil/recurso efetivamente autorizados. Nenhum perfil concede ADMIN_SEDUC;
não é permitido alterar acesso pertencente ao próprio administrador. Suspender
exige ATIVO, reativar exige SUSPENSO e revogar exige ATIVO ou SUSPENSO; REVOGADO
é definitivo. Escopo ausente/inválido e falta de acessos ativos falham fechados.

## Revalidação e proteções

Capacidade, delegação e território precisam pertencer ao mesmo acesso ativo.
Concessão e mudanças de status usam revalidação sob lock na transação existente;
a escolha do autorizador prioriza escopo mais específico e menor ID. QR exige
uma única unidade elegível e revalida identidade/acessos sob lock antes do Redis.

O filtro público mantém origem/CSRF, limite de payload e cotas por IP,
administrador e recurso. Redis usa formato de chave, HMAC, contador e TTL
compatíveis com o Node. Falha de Redis não libera requisições; memória só é
permitida fora de produção com Redis desabilitado. O container resolve IPs de
proxies confiáveis; os limites e a confiança de proxies devem ser conferidos na
configuração efetiva de implantação. Os endpoints internos continuam com HMAC,
timestamp, request ID e proteção de replay.

Auditoria de acessos ocorre após commit; QR é auditado após a publicação no
Redis, que não participa da transação JDBC. Logs não recebem payload, CPF,
email ou URL/token de QR.

## Validação inicial com armazenamento simulado

- `./mvnw -o -DskipTests compile`: passou com Java 21.
- Rodada final: 303 asserções HTTP e 148 de paridade/validação passaram;
  10 eventos de auditoria de 5 tipos conferidos, sem CPF, chaves ou tokens.
- HTTP Spring/Tomcat real em localhost, sessões e repositories simulados:
  leituras, mutações, concessão de identidade, validações, CSRF, escopo,
  capacidades, autoalteração, revogação, conflito de status, QR ambíguo,
  indisponibilidade, cotas e HMAC/replay passaram.
- Comparação com as implementações Node: tabela completa de capacidades,
  matriz de delegação, normalização de email, agrupamento IPv6, digest e chaves
  de rate limit passaram.
- Conferência de diff, whitespace e autoria: nenhum arquivo do Guilherme ou do
  Express foi alterado. Verificações temporárias em `/tmp/atesta-access-check`,
  sem novos testes automatizados no repositório e sem carregar `.env`.

Na etapa inicial, não foram executados os scripts de homologação existentes: eles escrevem em
MySQL. Locks/rollback/concorrência SQL e execução do Lua em Redis real ficaram
sem homologação naquela rodada. A homologação real posterior está vinculada acima.
Nenhum processo existente foi reiniciado em ambas as etapas.

## Arquivos da implementação

Todos abaixo de `src/main/`, salvo este relatório:

- `java/br/com/atestaponto/adminaccess/controller/PublicAdminAccessController.java`
- `java/br/com/atestaponto/adminaccess/controller/PublicAccessExceptionHandler.java`
- `java/br/com/atestaponto/adminaccess/dto/PublicAccessInput.java`
- `java/br/com/atestaponto/adminaccess/service/PublicAdminAccessService.java`
- `java/br/com/atestaponto/adminaccess/service/AdminAccessService.java`
- `java/br/com/atestaponto/auth/admin/config/AdminSecurityConfiguration.java`
- `java/br/com/atestaponto/auth/admin/config/PublicAccessApiFilter.java`
- `java/br/com/atestaponto/auth/admin/service/AdminAccessPolicy.java`
- `java/br/com/atestaponto/auth/admin/service/PublicAdminAudit.java`
- `java/br/com/atestaponto/auth/admin/service/PublicAdminRateLimit.java`
- `java/br/com/atestaponto/cargo/controller/PublicCargoController.java`
- `java/br/com/atestaponto/cargo/service/PublicCargoService.java`
- `java/br/com/atestaponto/schoolqr/controller/PublicSchoolQrController.java`
- `java/br/com/atestaponto/schoolqr/service/PublicSchoolQrService.java`
- `resources/application.properties`

Documentação e roteiro, sob `backend-spring/`:

- `VALIDACAO-ACESSOS-CARGOS-QR.md`
- `HOMOLOGACAO-ACESSOS-CARGOS-QR.md`
- `scripts/check-public-access-qr.py`
