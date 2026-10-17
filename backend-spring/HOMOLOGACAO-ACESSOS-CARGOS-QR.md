# Homologacao Spring — acessos, cargos e QR

HTTP direto no Spring real com Java 21, MySQL 8.4 e Redis 7 descartaveis em tmpfs,
Gov.br Python simulado e dados ficticios. Nao usa Express nem carrega .env.

Reproduzir: `./mvnw -o -DskipTests package && python3 scripts/check-public-access-qr.py`.
Repetir grupos afetados: `python3 scripts/check-public-access-qr.py --only race-revoke,rollback`.
Imagens locais: `mysql:8.4`, `redis:7-alpine`; Docker e Java 21 necessarios.
Cotas Redis sao resetadas entre grupos para isolar cenarios; grupo abuse testa o limite real.
As execuções de homologação não fazem commit, merge, push ou deploy.

## Resultado consolidado

**PASSOU: 200 verificações distintas; 16 grupos concluídos. FALHOU: 0 pendentes.
BLOQUEADO: 0 pendentes.** O histórico das rodadas abaixo foi preservado.

Na finalização da branch, o build Java 21 foi novamente aprovado e a confirmação
HTTP focada `--only rbac,race-revoke,race-status,rollback,qr,hmac` concluiu com
**PASSOU=110; FALHOU=0; BLOQUEADO=0**. `origin/develop` foi atualizado por fetch e
continuava no mesmo ancestral da branch, sem conflitos. O diff de 18 arquivos foi
revisado; Express, filtros/controllers internos e arquivos do Guilherme permanecem
preservados. Não foi identificada falha crítica que impedisse commit, push e PR.

| Escopo | Resultado |
|---|---|
| Java 21, build Maven offline e execução direta do JAR Spring | PASSOU |
| Contratos JSON/HTTP, paginação, acessos próprios, capacidades, opções e cargos | PASSOU |
| Concessão e reutilização de identidade, suspensão, reativação e revogação definitiva | PASSOU |
| Sessões, OAuth/PKCE, CSRF, RBAC e hierarquia de delegação | PASSOU |
| Território SEDUC/DRE/escola, acesso cruzado, autopromoção e campos internos forjados | PASSOU |
| Revogação concorrente nas três mutações e disputa entre duas APIs públicas | PASSOU |
| Conflito de status, rollback de identidade+acesso e de alteração de status | PASSOU |
| QR atual/regenerado, invalidação do QR antigo e remoção do índice Redis antigo | PASSOU |
| HMAC obrigatório em acessos/cargos/QR internos, assinatura adulterada, timestamp e replay | PASSOU |
| Cotas distribuídas, Retry-After, falha fechada e recuperação de Redis | PASSOU |
| Auditoria somente de operações confirmadas; sem CPF/email/chaves/tokens nos logs | PASSOU |
| mysql-dev, node-dev e .env preservados; recursos temporários removidos | PASSOU |

Build: `./mvnw -o -DskipTests package`, OpenJDK 21.0.12.1. Não foram necessárias
correções no código Java. Foram corrigidos no roteiro:

- Espera do servidor TCP definitivo do MySQL, evitando o servidor temporário da inicialização.
- CPFs fictícios com dígitos válidos para testar autopromoção sem barrar antes na validação de entrada.
- Leitura de todos os cabeçalhos `RateLimit` via `get_all`.
- Expectativa territorial: ADMIN_DIRETORIA da DRE 2 pode revogar um coordenador da própria DRE;
  continua proibido combinar capacidade de outro acesso com a escola fora desse território.

As três falhas de asserção e os dois bloqueios iniciais eram do roteiro/preparação.
Somente `rbac,abuse`, depois `rbac`, foram repetidos após essas correções. O grupo
`race-revoke` foi repetido isoladamente para incluir revogação e concessão
concorrentes pelas próprias APIs públicas. Não houve repetição global desnecessária.

Na corrida entre APIs, uma conexão SQL temporária apenas ordena a fila de locks:
a revogação HTTP conclui primeiro, a concessão HTTP recebe 403, nenhuma identidade
ou acesso é criado e só a revogação confirmada gera auditoria. Triggers de falha
existiram exclusivamente no banco descartável e foram removidos antes da limpeza.

Limites desta homologação: não é teste de carga nem validação em produção.
Os containers protegidos mantiveram IDs, estado, início e contador de reinícios;
os `.env` foram comparados por SHA-256 em cada execução. A conferência final de
Docker mostrou somente `mysql-dev` e `node-dev`.

## Rodada UTC 2026-10-17T21:15:21.222086+00:00

Grupos: todos.

| Resultado | Grupo | Cenario |
|---|---|---|
| BLOQUEADO | infra | RuntimeError: ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/run/mysqld/mysqld.sock' (2) |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Somente MySQL/Redis temporarios removidos; Spring/cliente SQL/Gov.br encerrados |

Totais: PASSOU=3; FALHOU=0; BLOQUEADO=1.

## Rodada UTC 2026-10-17T21:15:47.899818+00:00

Grupos: todos.

| Resultado | Grupo | Cenario |
|---|---|---|
| BLOQUEADO | infra | RuntimeError: ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/run/mysqld/mysqld.sock' (2) |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Somente MySQL/Redis temporarios removidos; Spring/cliente SQL/Gov.br encerrados |

Totais: PASSOU=3; FALHOU=0; BLOQUEADO=1.

## Rodada UTC 2026-10-17T21:17:38.280300+00:00

Grupos: todos.

| Resultado | Grupo | Cenario |
|---|---|---|
| PASSOU | infra | Java 21 + JAR Spring real + MySQL 8.4 tmpfs + Redis 7 temporarios + Gov.br simulado |
| PASSOU | infra | Authorization Code/PKCE real no Spring e renovacao de sessao dos perfis ficticios |
| PASSOU | contracts | Anonimo recebe 401 JSON: /api/admin/acessos |
| PASSOU | contracts | Anonimo recebe 401 JSON: /api/admin/acessos/meu |
| PASSOU | contracts | Anonimo recebe 401 JSON: /api/admin/acessos/capacidades |
| PASSOU | contracts | Anonimo recebe 401 JSON: /api/admin/acessos/opcoes-concessao |
| PASSOU | contracts | Anonimo recebe 401 JSON: /api/admin/acessos/101 |
| PASSOU | contracts | Anonimo recebe 401 JSON: /api/admin/cargos |
| PASSOU | contracts | Anonimo recebe 401 JSON: /api/admin/qr-tokens |
| PASSOU | contracts | Listagem/total e territorio reais: admin ficticio 1 |
| PASSOU | contracts | Projecao de campos, CPF mascarado e acoes: admin ficticio 1 |
| PASSOU | contracts | Listagem/total e territorio reais: admin ficticio 2 |
| PASSOU | contracts | Projecao de campos, CPF mascarado e acoes: admin ficticio 2 |
| PASSOU | contracts | Listagem/total e territorio reais: admin ficticio 3 |
| PASSOU | contracts | Projecao de campos, CPF mascarado e acoes: admin ficticio 3 |
| PASSOU | contracts | Listagem/total e territorio reais: admin ficticio 4 |
| PASSOU | contracts | Projecao de campos, CPF mascarado e acoes: admin ficticio 4 |
| PASSOU | contracts | Listagem/total e territorio reais: admin ficticio 8 |
| PASSOU | contracts | Projecao de campos, CPF mascarado e acoes: admin ficticio 8 |
| PASSOU | contracts | Listagem/total e territorio reais: admin ficticio 13 |
| PASSOU | contracts | Projecao de campos, CPF mascarado e acoes: admin ficticio 13 |
| PASSOU | contracts | Listagem/total e territorio reais: admin ficticio 17 |
| PASSOU | contracts | Projecao de campos, CPF mascarado e acoes: admin ficticio 17 |
| PASSOU | contracts | Paginacao sem sobreposicao |
| PASSOU | contracts | Acessos proprios nao expoem terceiros: 1 |
| PASSOU | contracts | Cargos: lista direta e booleano real 1 |
| PASSOU | contracts | Acessos proprios nao expoem terceiros: 2 |
| PASSOU | contracts | Cargos: lista direta e booleano real 2 |
| PASSOU | contracts | Acessos proprios nao expoem terceiros: 3 |
| PASSOU | contracts | Cargos: lista direta e booleano real 3 |
| PASSOU | contracts | Acessos proprios nao expoem terceiros: 5 |
| PASSOU | contracts | Cargos: lista direta e booleano real 5 |
| PASSOU | contracts | Acessos proprios nao expoem terceiros: 6 |
| PASSOU | contracts | Cargos: lista direta e booleano real 6 |
| PASSOU | contracts | Acessos proprios nao expoem terceiros: 7 |
| PASSOU | contracts | Cargos: lista direta e booleano real 7 |
| PASSOU | contracts | Acessos proprios nao expoem terceiros: 8 |
| PASSOU | contracts | Cargos: lista direta e booleano real 8 |
| PASSOU | contracts | Acessos proprios nao expoem terceiros: 13 |
| PASSOU | contracts | Cargos: lista direta e booleano real 13 |
| PASSOU | contracts | Acessos proprios nao expoem terceiros: 17 |
| PASSOU | contracts | Cargos: lista direta e booleano real 17 |
| PASSOU | contracts | Capacidades completas e ordem iguais ao Express |
| PASSOU | contracts | Validacao publica: /api/admin/acessos/0 |
| PASSOU | contracts | Validacao publica: /api/admin/acessos/nope |
| PASSOU | contracts | Validacao publica: /api/admin/acessos?page=0&limit=101 |
| PASSOU | contracts | Validacao publica: /api/admin/acessos?ativo=x&cargo=x |
| PASSOU | contracts | Consulta cruzada e inexistente indistinguiveis |
| PASSOU | grant | Concessao cria identidade/acesso e inicio padrao |
| PASSOU | grant | Concedente vem do servidor |
| PASSOU | grant | Identidade existente reutilizada |
| PASSOU | grant | Status e periodo publicos preservados |
| PASSOU | grant | Campos internos ignorados; desempate por menor ID |
| PASSOU | grant | DRE mais especifica escolhida antes de SEDUC |
| PASSOU | grant | Nome obrigatorio para nova identidade |
| PASSOU | grant | Somente concessoes validas persistem dados |
| PASSOU | lifecycle | Transicao atomica: suspender |
| PASSOU | lifecycle | Transicao atomica: reativar |
| PASSOU | lifecycle | Transicao atomica: revogar |
| PASSOU | lifecycle | Revogacao definitiva |
| PASSOU | lifecycle | Autoalteracao recusada e fonte preservada |
| PASSOU | rbac | Delegacao 2 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 2 -> ADMIN_DIRETORIA: permitida |
| PASSOU | rbac | Delegacao 2 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 2 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 2 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 2 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 3 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 3 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 3 -> DIRETOR: permitida |
| PASSOU | rbac | Delegacao 3 -> VICE_DIRETOR: permitida |
| PASSOU | rbac | Delegacao 3 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 3 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 1 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 1 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 1 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 1 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 1 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 1 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 5 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 5 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 5 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 5 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 5 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 5 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 6 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 6 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 6 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 6 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 6 -> SECRETARIA: negada |
| PASSOU | rbac | Delegacao 6 -> COORDENADOR: negada |
| PASSOU | rbac | Delegacao 7 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 7 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 7 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 7 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 7 -> SECRETARIA: negada |
| PASSOU | rbac | Delegacao 7 -> COORDENADOR: negada |
| PASSOU | rbac | Leituras por capacidade negadas para perfil sem gestao 6 |
| PASSOU | rbac | Leituras por capacidade negadas para perfil sem gestao 7 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 1 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 3 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 4 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 17 |
| FALHOU | rbac | AssertionError: POST /api/admin/acessos: esperado 403, recebido 422 |
| PASSOU | csrf | CSRF POST /api/admin/acessos, origem ausente |
| PASSOU | csrf | CSRF POST /api/admin/acessos, origem null |
| PASSOU | csrf | CSRF POST /api/admin/acessos, origem https://evil.invalid |
| PASSOU | csrf | CSRF POST /api/admin/acessos, origem http://127.0.0.1:40079.evil |
| PASSOU | csrf | CSRF PATCH /api/admin/acessos/101/suspender, origem ausente |
| PASSOU | csrf | CSRF PATCH /api/admin/acessos/101/suspender, origem null |
| PASSOU | csrf | CSRF PATCH /api/admin/acessos/101/suspender, origem https://evil.invalid |
| PASSOU | csrf | CSRF PATCH /api/admin/acessos/101/suspender, origem http://127.0.0.1:40079.evil |
| PASSOU | csrf | CSRF POST /api/admin/qr-tokens, origem ausente |
| PASSOU | csrf | CSRF POST /api/admin/qr-tokens, origem null |
| PASSOU | csrf | CSRF POST /api/admin/qr-tokens, origem https://evil.invalid |
| PASSOU | csrf | CSRF POST /api/admin/qr-tokens, origem http://127.0.0.1:40079.evil |
| PASSOU | csrf | CSRF sem escrita ou auditoria de sucesso |
| PASSOU | csrf | Referer de mesma origem preservado |
| PASSOU | sessions | Login fail-closed: sem acesso/futuro/inativo/expirado 9 |
| PASSOU | sessions | Login fail-closed: sem acesso/futuro/inativo/expirado 10 |
| PASSOU | sessions | Login fail-closed: sem acesso/futuro/inativo/expirado 11 |
| PASSOU | sessions | Login fail-closed: sem acesso/futuro/inativo/expirado 12 |
| PASSOU | sessions | OAuth state adulterado invalida sessao |
| PASSOU | sessions | Sessao revalida identidade, status e vigencia persistidos |
| PASSOU | sessions | Sessao revalida identidade, status e vigencia persistidos |
| PASSOU | sessions | Sessao revalida identidade, status e vigencia persistidos |
| PASSOU | sessions | Logout de origem valida |
| PASSOU | race-revoke | Revogacao concorrente bloqueia mutacao e auditoria: /api/admin/acessos |
| PASSOU | race-revoke | Revogacao concorrente nao publica QR: /api/admin/acessos |
| PASSOU | race-revoke | Revogacao concorrente bloqueia mutacao e auditoria: /api/admin/acessos/101/suspender |
| PASSOU | race-revoke | Revogacao concorrente nao publica QR: /api/admin/acessos/101/suspender |
| PASSOU | race-revoke | Revogacao concorrente bloqueia mutacao e auditoria: /api/admin/qr-tokens |
| PASSOU | race-revoke | Revogacao concorrente nao publica QR: /api/admin/qr-tokens |
| PASSOU | race-status | Status concorrente nao e sobrescrito; conflito 409 sem auditoria de sucesso |
| PASSOU | rollback | Rollback concessao desfaz identidade+acesso e nao audita sucesso |
| PASSOU | rollback | Rollback de status preserva estado e nao audita sucesso |
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
| PASSOU | hmac | Cookie publico nao substitui HMAC: /internal/acessos-administrativos/consultar |
| PASSOU | hmac | HMAC valido preserva contrato interno: /internal/acessos-administrativos/consultar |
| PASSOU | hmac | Replay HMAC rejeitado: /internal/acessos-administrativos/consultar |
| PASSOU | hmac | HMAC adulterado rejeitado: /internal/acessos-administrativos/consultar |
| PASSOU | hmac | Timestamp expirado rejeitado: /internal/acessos-administrativos/consultar |
| PASSOU | hmac | Cookie publico nao substitui HMAC: /internal/escolas/qr/atual |
| PASSOU | hmac | HMAC valido preserva contrato interno: /internal/escolas/qr/atual |
| PASSOU | hmac | Replay HMAC rejeitado: /internal/escolas/qr/atual |
| PASSOU | hmac | HMAC adulterado rejeitado: /internal/escolas/qr/atual |
| PASSOU | hmac | Timestamp expirado rejeitado: /internal/escolas/qr/atual |
| PASSOU | hmac | Cookie publico nao substitui HMAC: /internal/cargos |
| PASSOU | hmac | HMAC valido preserva contrato interno: /internal/cargos |
| PASSOU | hmac | Replay HMAC rejeitado: /internal/cargos |
| PASSOU | hmac | HMAC adulterado rejeitado: /internal/cargos |
| PASSOU | hmac | Timestamp expirado rejeitado: /internal/cargos |
| PASSOU | abuse | Cota sensivel de 40 compartilhada entre acesso e QR, inclusive negacoes |
| FALHOU | abuse | AssertionError: Headers de limite e Retry-After preservados |
| PASSOU | expiry | TTL absoluto expirado invalida sessao Spring |
| PASSOU | audit | Logs sem chaves OAuth/HMAC/sessao ou tokens de QR |
| PASSOU | audit | Auditoria sem CPF/email/token ou URL de QR |
| PASSOU | audit | Evento de auditoria registrado: acesso_administrativo_concedido |
| PASSOU | audit | Evento de auditoria registrado: acesso_administrativo_suspender |
| PASSOU | audit | Evento de auditoria registrado: acesso_administrativo_reativar |
| PASSOU | audit | Evento de auditoria registrado: acesso_administrativo_revogar |
| PASSOU | audit | Evento de auditoria registrado: qr_code_escolar_gerado |
| PASSOU | audit | Auditoria identifica operador e origem sem payload sensivel |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Somente MySQL/Redis temporarios removidos; Spring/cliente SQL/Gov.br encerrados |

Totais: PASSOU=179; FALHOU=2; BLOQUEADO=0.

## Rodada UTC 2026-10-17T21:18:40.661723+00:00

Grupos: rbac,abuse.

| Resultado | Grupo | Cenario |
|---|---|---|
| PASSOU | infra | Java 21 + JAR Spring real + MySQL 8.4 tmpfs + Redis 7 temporarios + Gov.br simulado |
| PASSOU | infra | Authorization Code/PKCE real no Spring e renovacao de sessao dos perfis ficticios |
| PASSOU | rbac | Delegacao 2 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 2 -> ADMIN_DIRETORIA: permitida |
| PASSOU | rbac | Delegacao 2 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 2 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 2 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 2 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 3 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 3 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 3 -> DIRETOR: permitida |
| PASSOU | rbac | Delegacao 3 -> VICE_DIRETOR: permitida |
| PASSOU | rbac | Delegacao 3 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 3 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 1 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 1 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 1 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 1 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 1 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 1 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 5 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 5 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 5 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 5 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 5 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 5 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 6 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 6 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 6 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 6 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 6 -> SECRETARIA: negada |
| PASSOU | rbac | Delegacao 6 -> COORDENADOR: negada |
| PASSOU | rbac | Delegacao 7 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 7 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 7 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 7 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 7 -> SECRETARIA: negada |
| PASSOU | rbac | Delegacao 7 -> COORDENADOR: negada |
| PASSOU | rbac | Leituras por capacidade negadas para perfil sem gestao 6 |
| PASSOU | rbac | Leituras por capacidade negadas para perfil sem gestao 7 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 1 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 3 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 4 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 17 |
| PASSOU | rbac | Autopromocao/elevacao por concessao recusadas |
| FALHOU | rbac | AssertionError: PATCH /api/admin/acessos/102/revogar: esperado 403, recebido 200 |
| PASSOU | abuse | Cota sensivel de 40 compartilhada entre acesso e QR, inclusive negacoes |
| PASSOU | abuse | Headers de limite e Retry-After preservados |
| PASSOU | abuse | Cotas reais no Redis sem identidade em claro nas chaves |
| PASSOU | abuse | Redis indisponivel falha fechado em producao |
| PASSOU | abuse | Redis recuperado permite consultas sem fallback em memoria |
| PASSOU | audit | Logs sem chaves OAuth/HMAC/sessao ou tokens de QR |
| PASSOU | audit | Auditoria sem CPF/email/token ou URL de QR |
| PASSOU | audit | Auditoria identifica operador e origem sem payload sensivel |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Somente MySQL/Redis temporarios removidos; Spring/cliente SQL/Gov.br encerrados |

Totais: PASSOU=56; FALHOU=1; BLOQUEADO=0.

## Rodada UTC 2026-10-17T21:20:13.072503+00:00

Grupos: rbac.

| Resultado | Grupo | Cenario |
|---|---|---|
| PASSOU | infra | Java 21 + JAR Spring real + MySQL 8.4 tmpfs + Redis 7 temporarios + Gov.br simulado |
| PASSOU | infra | Authorization Code/PKCE real no Spring e renovacao de sessao dos perfis ficticios |
| PASSOU | rbac | Delegacao 2 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 2 -> ADMIN_DIRETORIA: permitida |
| PASSOU | rbac | Delegacao 2 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 2 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 2 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 2 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 3 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 3 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 3 -> DIRETOR: permitida |
| PASSOU | rbac | Delegacao 3 -> VICE_DIRETOR: permitida |
| PASSOU | rbac | Delegacao 3 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 3 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 1 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 1 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 1 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 1 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 1 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 1 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 5 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 5 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 5 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 5 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 5 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 5 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 6 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 6 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 6 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 6 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 6 -> SECRETARIA: negada |
| PASSOU | rbac | Delegacao 6 -> COORDENADOR: negada |
| PASSOU | rbac | Delegacao 7 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 7 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 7 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 7 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 7 -> SECRETARIA: negada |
| PASSOU | rbac | Delegacao 7 -> COORDENADOR: negada |
| PASSOU | rbac | Leituras por capacidade negadas para perfil sem gestao 6 |
| PASSOU | rbac | Leituras por capacidade negadas para perfil sem gestao 7 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 1 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 3 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 4 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 17 |
| PASSOU | rbac | Autopromocao/elevacao por concessao recusadas |
| PASSOU | rbac | DRE do mesmo acesso autoriza alteracao; escola de outro acesso sem capacidade nao autoriza |
| PASSOU | rbac | SEDUC altera direcao abaixo dele sem poder conceder DIRETOR |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 1 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 1 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 2 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 2 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 3 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 3 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 5 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 5 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 8 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 8 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 13 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 13 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 17 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 17 |
| PASSOU | audit | Logs sem chaves OAuth/HMAC/sessao ou tokens de QR |
| PASSOU | audit | Auditoria sem CPF/email/token ou URL de QR |
| PASSOU | audit | Auditoria identifica operador e origem sem payload sensivel |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Somente MySQL/Redis temporarios removidos; Spring/cliente SQL/Gov.br encerrados |

Totais: PASSOU=67; FALHOU=0; BLOQUEADO=0.

## Rodada UTC 2026-10-17T21:22:00.652622+00:00

Grupos: race-revoke.

| Resultado | Grupo | Cenario |
|---|---|---|
| PASSOU | infra | Java 21 + JAR Spring real + MySQL 8.4 tmpfs + Redis 7 temporarios + Gov.br simulado |
| PASSOU | infra | Authorization Code/PKCE real no Spring e renovacao de sessao dos perfis ficticios |
| PASSOU | race-revoke | Revogacao concorrente bloqueia mutacao e auditoria: /api/admin/acessos |
| PASSOU | race-revoke | Revogacao concorrente nao publica QR: /api/admin/acessos |
| PASSOU | race-revoke | Revogacao concorrente bloqueia mutacao e auditoria: /api/admin/acessos/101/suspender |
| PASSOU | race-revoke | Revogacao concorrente nao publica QR: /api/admin/acessos/101/suspender |
| PASSOU | race-revoke | Revogacao concorrente bloqueia mutacao e auditoria: /api/admin/qr-tokens |
| PASSOU | race-revoke | Revogacao concorrente nao publica QR: /api/admin/qr-tokens |
| PASSOU | race-revoke | Revogacao pela API publica vence concessao concorrente e impede identidade/acesso novos |
| PASSOU | race-revoke | Concorrencia HTTP audita apenas revogacao confirmada, nunca concessao recusada |
| PASSOU | audit | Logs sem chaves OAuth/HMAC/sessao ou tokens de QR |
| PASSOU | audit | Logs nao expoem CPF ou email ficticios em claro |
| PASSOU | audit | Auditoria sem CPF/email/token ou URL de QR |
| PASSOU | audit | Auditoria identifica operador e origem sem payload sensivel |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Somente MySQL/Redis temporarios removidos; Spring/cliente SQL/Gov.br encerrados |

Totais: PASSOU=17; FALHOU=0; BLOQUEADO=0.

## Rodada UTC 2026-10-17T21:39:48.557600+00:00

Grupos: rbac,race-revoke,race-status,rollback,qr,hmac.

| Resultado | Grupo | Cenario |
|---|---|---|
| PASSOU | infra | Java 21 + JAR Spring real + MySQL 8.4 tmpfs + Redis 7 temporarios + Gov.br simulado |
| PASSOU | infra | Authorization Code/PKCE real no Spring e renovacao de sessao dos perfis ficticios |
| PASSOU | rbac | Delegacao 2 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 2 -> ADMIN_DIRETORIA: permitida |
| PASSOU | rbac | Delegacao 2 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 2 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 2 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 2 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 3 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 3 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 3 -> DIRETOR: permitida |
| PASSOU | rbac | Delegacao 3 -> VICE_DIRETOR: permitida |
| PASSOU | rbac | Delegacao 3 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 3 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 1 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 1 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 1 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 1 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 1 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 1 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 5 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 5 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 5 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 5 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 5 -> SECRETARIA: permitida |
| PASSOU | rbac | Delegacao 5 -> COORDENADOR: permitida |
| PASSOU | rbac | Delegacao 6 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 6 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 6 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 6 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 6 -> SECRETARIA: negada |
| PASSOU | rbac | Delegacao 6 -> COORDENADOR: negada |
| PASSOU | rbac | Delegacao 7 -> ADMIN_SEDUC: negada |
| PASSOU | rbac | Delegacao 7 -> ADMIN_DIRETORIA: negada |
| PASSOU | rbac | Delegacao 7 -> DIRETOR: negada |
| PASSOU | rbac | Delegacao 7 -> VICE_DIRETOR: negada |
| PASSOU | rbac | Delegacao 7 -> SECRETARIA: negada |
| PASSOU | rbac | Delegacao 7 -> COORDENADOR: negada |
| PASSOU | rbac | Leituras por capacidade negadas para perfil sem gestao 6 |
| PASSOU | rbac | Leituras por capacidade negadas para perfil sem gestao 7 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 1 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 3 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 4 |
| PASSOU | rbac | Concessao cruzada/combinar capacidades e escopos negado: 17 |
| PASSOU | rbac | Autopromocao/elevacao por concessao recusadas |
| PASSOU | rbac | DRE do mesmo acesso autoriza alteracao; escola de outro acesso sem capacidade nao autoriza |
| PASSOU | rbac | SEDUC altera direcao abaixo dele sem poder conceder DIRETOR |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 1 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 1 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 2 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 2 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 3 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 3 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 5 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 5 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 8 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 8 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 13 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 13 |
| PASSOU | rbac | Opcoes sem elevacao nem recursos vazios 17 |
| PASSOU | rbac | Opcoes filtradas pelo territorio do mesmo acesso 17 |
| PASSOU | race-revoke | Revogacao concorrente bloqueia mutacao e auditoria: /api/admin/acessos |
| PASSOU | race-revoke | Revogacao concorrente nao publica QR: /api/admin/acessos |
| PASSOU | race-revoke | Revogacao concorrente bloqueia mutacao e auditoria: /api/admin/acessos/101/suspender |
| PASSOU | race-revoke | Revogacao concorrente nao publica QR: /api/admin/acessos/101/suspender |
| PASSOU | race-revoke | Revogacao concorrente bloqueia mutacao e auditoria: /api/admin/qr-tokens |
| PASSOU | race-revoke | Revogacao concorrente nao publica QR: /api/admin/qr-tokens |
| PASSOU | race-revoke | Revogacao pela API publica vence concessao concorrente e impede identidade/acesso novos |
| PASSOU | race-revoke | Concorrencia HTTP audita apenas revogacao confirmada, nunca concessao recusada |
| PASSOU | race-status | Status concorrente nao e sobrescrito; conflito 409 sem auditoria de sucesso |
| PASSOU | rollback | Rollback concessao desfaz identidade+acesso e nao audita sucesso |
| PASSOU | rollback | Rollback de status preserva estado e nao audita sucesso |
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
| PASSOU | hmac | Cookie publico nao substitui HMAC: /internal/acessos-administrativos/consultar |
| PASSOU | hmac | HMAC valido preserva contrato interno: /internal/acessos-administrativos/consultar |
| PASSOU | hmac | Replay HMAC rejeitado: /internal/acessos-administrativos/consultar |
| PASSOU | hmac | HMAC adulterado rejeitado: /internal/acessos-administrativos/consultar |
| PASSOU | hmac | Timestamp expirado rejeitado: /internal/acessos-administrativos/consultar |
| PASSOU | hmac | Cookie publico nao substitui HMAC: /internal/escolas/qr/atual |
| PASSOU | hmac | HMAC valido preserva contrato interno: /internal/escolas/qr/atual |
| PASSOU | hmac | Replay HMAC rejeitado: /internal/escolas/qr/atual |
| PASSOU | hmac | HMAC adulterado rejeitado: /internal/escolas/qr/atual |
| PASSOU | hmac | Timestamp expirado rejeitado: /internal/escolas/qr/atual |
| PASSOU | hmac | Cookie publico nao substitui HMAC: /internal/cargos |
| PASSOU | hmac | HMAC valido preserva contrato interno: /internal/cargos |
| PASSOU | hmac | Replay HMAC rejeitado: /internal/cargos |
| PASSOU | hmac | HMAC adulterado rejeitado: /internal/cargos |
| PASSOU | hmac | Timestamp expirado rejeitado: /internal/cargos |
| PASSOU | audit | Logs sem chaves OAuth/HMAC/sessao ou tokens de QR |
| PASSOU | audit | Logs nao expoem CPF ou email ficticios em claro |
| PASSOU | audit | Auditoria sem CPF/email/token ou URL de QR |
| PASSOU | audit | Auditoria identifica operador e origem sem payload sensivel |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Somente MySQL/Redis temporarios removidos; Spring/cliente SQL/Gov.br encerrados |

Totais: PASSOU=110; FALHOU=0; BLOQUEADO=0.
