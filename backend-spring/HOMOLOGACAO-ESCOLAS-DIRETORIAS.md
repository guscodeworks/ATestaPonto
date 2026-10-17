# Homologacao Spring — escolas e diretorias

Java 21, MySQL 8.4 temporario em tmpfs e mocks Python locais de Gov.br/CEP.
HTTP direto no Spring, sem Express, dados exclusivamente ficticios. Nao le .env.

Reproduzir: `./mvnw -o -DskipTests package && python3 scripts/check-public-schools.py`.
Reexecucao seletiva: `python3 scripts/check-public-schools.py --only race-school,race-parallel,race-dre`.
Requer Docker e imagem mysql:8.4 local. Sem commit, merge ou deploy.

## Resultado consolidado

**PASSOU: 146 verificacoes na ultima execucao aplicavel de cada grupo; FALHOU: 0 pendentes; BLOQUEADO: 0 pendentes.**

Compilacao e empacotamento com OpenJDK 21.0.12.1: `./mvnw -o -DskipTests package` — BUILD SUCCESS.
A primeira bateria funcional registrou 134 PASSOU e 3 FALHOU: duas falhas do produto e uma fixture de vigencia incorreta. Foram corrigidas e os grupos afetados reexecutados: 82 PASSOU, 0 FALHOU e 0 BLOQUEADO. CEP, validacoes, CSRF e TTL, sem alteracoes, conservam os resultados da bateria inicial.
As tentativas iniciais de preparar a fixture ficaram bloqueadas antes de iniciar os cenarios; foram resolvidas. O historico abaixo conserva esses resultados, sem representar pendencias atuais.

| Resultado atual | Grupo | Verificacoes |
|---|---|---|
| PASSOU | infra | 3 |
| PASSOU | cleanup | 3 |
| PASSOU | read | 15 |
| PASSOU | preview-cep | 11 |
| PASSOU | create | 3 |
| PASSOU | departments | 7 |
| PASSOU | validation | 25 |
| PASSOU | rbac | 14 |
| PASSOU | csrf | 27 |
| PASSOU | rollback | 3 |
| PASSOU | race-school | 2 |
| PASSOU | race-parallel | 2 |
| PASSOU | race-dre | 4 |
| PASSOU | sessions | 13 |
| PASSOU | hmac | 13 |
| PASSOU | expiry | 1 |

Correcoes relacionadas:
- Cadastros escolares concorrentes consumiam as duas conexoes do pool e a revalidacao em REQUIRES_NEW solicitava outra conexao: um cadastro retornava 500. A autorizacao passa a usar leitura corrente FOR UPDATE na mesma transacao/conexao da escrita; o caso passou com 201 + 409 e apenas um registro.
- Edicao de DRE usava autorizacao anterior a espera pelo lock: acesso SEDUC revogado ainda permitia 200. Edicao e status agora revalidam e bloqueiam identidade/acessos na transacao, apos bloquear o recurso; revogacao retorna 403, sem gravar nem auditar sucesso.
- A fixture de expiracao passou a ajustar data_inicio junto com data_fim para respeitar chk_acessos_periodo.

Arquivos alterados nesta homologacao (alem da implementacao publica anterior):
- `src/main/java/br/com/atestaponto/auth/admin/repository/AdminContextRepository.java`
- `src/main/java/br/com/atestaponto/auth/admin/service/AdminContextService.java`
- `src/main/java/br/com/atestaponto/auth/admin/service/PublicAdminAuthorization.java`
- `src/main/java/br/com/atestaponto/auth/admin/service/PublicSchoolAuthorization.java`
- `src/main/java/br/com/atestaponto/school/service/PublicSchoolService.java`
- `src/main/java/br/com/atestaponto/educationdepartment/service/EducationDepartmentService.java`
- `src/main/java/br/com/atestaponto/educationdepartment/service/PublicEducationDepartmentService.java`
- `scripts/check-public-schools.py`
- `HOMOLOGACAO-ESCOLAS-DIRETORIAS.md`

Preservacao e limpeza: em cada rodada, os containers mysql-dev/node-dev mantiveram ID, estado, StartedAt e RestartCount; os .env mantiveram seus hashes. Somente o container exclusivo da rodada, processos filhos Java, servidor Python local, clientes de locks e diretorio temporario foram removidos/encerrados. A imagem MySQL preexistente foi reutilizada e preservada. Nenhum arquivo do gateway, simulador ATestaID ou schema versionado foi alterado nesta homologacao.

Limite: Gov.br oficial, BrasilAPI publica e banco real nao foram acessados. Nao e uma medicao de carga de producao. Sem commit, merge, push ou deploy.

## Rodada UTC 2026-10-17T19:16:09.287624+00:00

Grupos: todos.

| Resultado | Grupo | Cenario |
|---|---|---|
| BLOQUEADO | infra | CalledProcessError: Command '('docker', 'exec', '-i', 'atesta-school-check-a3b1c44e8ae6', 'mysql', '-uroot', '-N', 'school_check')' returned non-zero exit status 1. |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, datas de inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Container MySQL temporario removido; processos Java/Python e clientes temporarios encerrados |

Totais desta rodada: PASSOU=3; FALHOU=0; BLOQUEADO=1.

## Rodada UTC 2026-10-17T19:16:24.364357+00:00

Grupos: todos.

| Resultado | Grupo | Cenario |
|---|---|---|
| BLOQUEADO | infra | RuntimeError: ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/run/mysqld/mysqld.sock' (2) |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, datas de inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Container MySQL temporario removido; processos Java/Python e clientes temporarios encerrados |

Totais desta rodada: PASSOU=3; FALHOU=0; BLOQUEADO=1.

## Rodada UTC 2026-10-17T19:17:46.566777+00:00

Grupos: todos.

| Resultado | Grupo | Cenario |
|---|---|---|
| PASSOU | infra | Java 21, MySQL 8.4 tmpfs e Spring real; somente mocks Python em localhost |
| PASSOU | infra | Login Authorization Code/PKCE e renovacao de sessao dos perfis de homologacao |
| PASSOU | read | SEDUC lista todas as escolas; contrato de itens e paginacao |
| PASSOU | read | DRE A lista apenas escolas da propria diretoria, incluindo inativas |
| PASSOU | read | DRE B lista apenas escola B |
| PASSOU | read | Perfil escolar 1 restrito a propria escola |
| PASSOU | read | Perfil escolar 5 restrito a propria escola |
| PASSOU | read | Perfil escolar 6 restrito a propria escola |
| PASSOU | read | Perfil escolar 7 restrito a propria escola |
| PASSOU | read | Escopo de DRE sem unidades retorna vazio, sem acesso global |
| PASSOU | read | Filtro ativa=0 |
| PASSOU | read | Filtros DRE/q e paginacao |
| PASSOU | read | LIKE escapa curingas fornecidos pelo cliente |
| PASSOU | read | Parametros de escopo do navegador nao ampliam territorio |
| PASSOU | read | Consulta individual preserva JSON e timestamps do Express |
| PASSOU | read | Consulta externa e inexistente retornam igualmente 403 |
| PASSOU | read | Seletor de cadastro limitado a DRE ativa autorizada |
| PASSOU | preview-cep | CEP formatado retorna campos publicos e coordenadas |
| PASSOU | preview-cep | CEP sem geolocalizacao retorna null |
| PASSOU | preview-cep | Previa usa CEP no servidor e retorna JSON direto do dominio |
| PASSOU | preview-cep | Previa sem coordenadas informa localizacao pendente |
| PASSOU | preview-cep | CEP e previa nao gravam registros |
| PASSOU | preview-cep | CEP 11111111: erro e status 422 preservados |
| PASSOU | preview-cep | CEP 13010999: erro e status 404 preservados |
| PASSOU | preview-cep | CEP 13010998: erro e status 502 preservados |
| PASSOU | preview-cep | CEP 13010997: erro e status 502 preservados |
| PASSOU | preview-cep | CEP 13010996: erro e status 502 preservados |
| PASSOU | preview-cep | Coordenadas externas ao Brasil rejeitadas na previa |
| PASSOU | create | Cadastro recalcula endereco/coordenadas/estado e ignora valores forjados |
| PASSOU | create | Escola criada consultavel na propria DRE |
| PASSOU | create | Conflitos de nome e codigo INEP retornam 409, sem duplicar escola |
| PASSOU | departments | Listagem de DRE projeta somente campos publicos |
| PASSOU | departments | Filtro de DRE inativa |
| PASSOU | departments | Cadastro 201 e edicao PUT 200 de DRE com normalizacao |
| PASSOU | departments | Desativacao de DRE sem dependencias |
| PASSOU | departments | Reativacao de DRE; duplicidade entre inativas retorna 409 |
| PASSOU | departments | Dependencias de escola ativa e acesso administrativo impedem desativacao de DRE |
| PASSOU | departments | Vinculo nao encerrado e acesso pendente na escola inativa impedem desativacao |
| PASSOU | validation | Validacao escolar 422: ?page=0 |
| PASSOU | validation | Validacao escolar 422: ?limit=101 |
| PASSOU | validation | Validacao escolar 422: ?ativa=maybe |
| PASSOU | validation | Validacao escolar 422: ?diretoria_ensino_id=0 |
| PASSOU | validation | Validacao escolar 422: ?q=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |
| PASSOU | validation | Validacao escolar 422: ?page=1&page=2 |
| PASSOU | validation | Validacao escolar 422: /0 |
| PASSOU | validation | Previa rejeita campo invalido: nome=ab |
| PASSOU | validation | Previa rejeita campo invalido: nome=<invalid> |
| PASSOU | validation | Previa rejeita campo invalido: cep=abc |
| PASSOU | validation | Previa rejeita campo invalido: codigo_inep=1 |
| PASSOU | validation | Previa rejeita campo invalido: raio_permitido_metros=9 |
| PASSOU | validation | Previa rejeita campo invalido: raio_permitido_metros=100 |
| PASSOU | validation | Previa rejeita campo invalido: diretoria_ensino_id=1 |
| PASSOU | validation | Cadastro sem coordenadas rejeitado sem persistencia |
| PASSOU | validation | Validacao DRE 400: GET /api/admin/diretorias?ativo=1 |
| PASSOU | validation | Validacao DRE 400: GET /api/admin/diretorias?ativo=true&ativo=false |
| PASSOU | validation | Validacao DRE 400: POST /api/admin/diretorias |
| PASSOU | validation | Validacao DRE 400: POST /api/admin/diretorias |
| PASSOU | validation | Validacao DRE 400: PUT /api/admin/diretorias/0 |
| PASSOU | validation | Validacao DRE 400: PUT /api/admin/diretorias/4294967296 |
| PASSOU | validation | Validacao DRE 400: PUT /api/admin/diretorias/1/status |
| PASSOU | validation | DRE inexistente 404 sem vazar detalhes |
| PASSOU | validation | DRE inexistente 404 sem vazar detalhes |
| PASSOU | validation | JSON malformado retorna 400 |
| PASSOU | rbac | Perfil 1 nao possui escola.criar |
| PASSOU | rbac | Perfil 2 nao possui escola.criar |
| PASSOU | rbac | Perfil 5 nao possui escola.criar |
| PASSOU | rbac | Perfil 6 nao possui escola.criar |
| PASSOU | rbac | Perfil 7 nao possui escola.criar |
| PASSOU | rbac | Perfil 1 nao possui diretoria.gerenciar |
| PASSOU | rbac | Perfil 3 nao possui diretoria.gerenciar |
| PASSOU | rbac | Perfil 4 nao possui diretoria.gerenciar |
| PASSOU | rbac | Perfil 5 nao possui diretoria.gerenciar |
| PASSOU | rbac | Perfil 6 nao possui diretoria.gerenciar |
| PASSOU | rbac | Perfil 7 nao possui diretoria.gerenciar |
| PASSOU | rbac | SEDUC+DRE nao soma capacidade de criar com escopo global |
| PASSOU | rbac | Mutacoes sem capacidade ou fora do territorio nao gravam |
| PASSOU | rbac | Sessao ausente/forjada e identificadores do navegador nao autorizam |
| PASSOU | csrf | CSRF POST /api/admin/escolas, origem ausente |
| PASSOU | csrf | CSRF POST /api/admin/escolas, origem null |
| PASSOU | csrf | CSRF POST /api/admin/escolas, origem https://evil.invalid |
| PASSOU | csrf | CSRF POST /api/admin/escolas, origem http://127.0.0.1:47115.evil |
| PASSOU | csrf | CSRF POST /api/admin/escolas, origem http://localhost:47115 |
| PASSOU | csrf | CSRF POST /api/admin/escolas/preview, origem ausente |
| PASSOU | csrf | CSRF POST /api/admin/escolas/preview, origem null |
| PASSOU | csrf | CSRF POST /api/admin/escolas/preview, origem https://evil.invalid |
| PASSOU | csrf | CSRF POST /api/admin/escolas/preview, origem http://127.0.0.1:47115.evil |
| PASSOU | csrf | CSRF POST /api/admin/escolas/preview, origem http://localhost:47115 |
| PASSOU | csrf | CSRF POST /api/admin/diretorias, origem ausente |
| PASSOU | csrf | CSRF POST /api/admin/diretorias, origem null |
| PASSOU | csrf | CSRF POST /api/admin/diretorias, origem https://evil.invalid |
| PASSOU | csrf | CSRF POST /api/admin/diretorias, origem http://127.0.0.1:47115.evil |
| PASSOU | csrf | CSRF POST /api/admin/diretorias, origem http://localhost:47115 |
| PASSOU | csrf | CSRF PUT /api/admin/diretorias/2, origem ausente |
| PASSOU | csrf | CSRF PUT /api/admin/diretorias/2, origem null |
| PASSOU | csrf | CSRF PUT /api/admin/diretorias/2, origem https://evil.invalid |
| PASSOU | csrf | CSRF PUT /api/admin/diretorias/2, origem http://127.0.0.1:47115.evil |
| PASSOU | csrf | CSRF PUT /api/admin/diretorias/2, origem http://localhost:47115 |
| PASSOU | csrf | CSRF PUT /api/admin/diretorias/2/status, origem ausente |
| PASSOU | csrf | CSRF PUT /api/admin/diretorias/2/status, origem null |
| PASSOU | csrf | CSRF PUT /api/admin/diretorias/2/status, origem https://evil.invalid |
| PASSOU | csrf | CSRF PUT /api/admin/diretorias/2/status, origem http://127.0.0.1:47115.evil |
| PASSOU | csrf | CSRF PUT /api/admin/diretorias/2/status, origem http://localhost:47115 |
| PASSOU | csrf | Referer da origem configurada aceito sem Origin |
| PASSOU | csrf | Tentativas CSRF nao gravam |
| PASSOU | rollback | Rollback escolar preserva contagem e nao audita sucesso |
| PASSOU | rollback | Rollback cadastro DRE sem registro parcial ou auditoria de sucesso |
| PASSOU | rollback | Rollback edicao/status DRE preserva dados e auditoria |
| PASSOU | race-school | Revogacao durante CEP impede criacao e auditoria de sucesso |
| PASSOU | race-school | DRE desativada enquanto cadastro aguarda lock impede INSERT |
| FALHOU | race-parallel | Cadastros simultaneos de mesma escola: 201+409, sem esgotar pool; recebido [201, 500] |
| FALHOU | race-dre | PUT /api/admin/diretorias/4: esperado 403, recebido 200: {"success":true,"data":{"ativo":false,"cidade_sede":"Fictional City","nome":"Fictional Created DRE 73","codigo":"CREATED-73","id":4}} |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 9 |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 10 |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 11 |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 12 |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 14 |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 15 |
| PASSOU | sessions | OAuth state incorreto rejeitado |
| PASSOU | sessions | OAuth state consumido nao pode ser reutilizado |
| PASSOU | sessions | Sessao invalidada na proxima requisicao: ativo=0 |
| FALHOU | sessions | ERROR 3819 (HY000) at line 1: Check constraint 'chk_acessos_periodo' is violated. |
| PASSOU | hmac | Cookie publico nao substitui HMAC interno |
| PASSOU | hmac | HMAC valido preserva contrato interno de listagem |
| PASSOU | hmac | Replay HMAC rejeitado |
| PASSOU | hmac | Assinatura adulterada rejeitada |
| PASSOU | hmac | Timestamp HMAC expirado rejeitado |
| PASSOU | hmac | GET interno de DRE assinado inclui query no HMAC |
| PASSOU | hmac | Contrato HMAC preservado: POST /internal/escolas/preview |
| PASSOU | hmac | Contrato HMAC preservado: POST /internal/escolas |
| PASSOU | hmac | Contrato HMAC preservado: POST /internal/diretorias |
| PASSOU | hmac | Caminho alternativo interno exige HMAC: /internal;probe/escolas/listagem |
| PASSOU | hmac | Caminho alternativo interno exige HMAC: /%69nternal/escolas/listagem |
| PASSOU | expiry | TTL absoluto expirado invalida sessao Spring |
| PASSOU | infra | Logs nao expoem chaves ou credenciais temporarias |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, datas de inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Container MySQL temporario removido; processos Java/Python e clientes temporarios encerrados |

Totais desta rodada: PASSOU=134; FALHOU=3; BLOQUEADO=0.

## Rodada UTC 2026-10-17T19:19:42.562930+00:00

Grupos: read,create,departments,rbac,rollback,race-school,race-parallel,race-dre,sessions,hmac.

| Resultado | Grupo | Cenario |
|---|---|---|
| PASSOU | infra | Java 21, MySQL 8.4 tmpfs e Spring real; somente mocks Python em localhost |
| PASSOU | infra | Login Authorization Code/PKCE e renovacao de sessao dos perfis de homologacao |
| PASSOU | read | SEDUC lista todas as escolas; contrato de itens e paginacao |
| PASSOU | read | DRE A lista apenas escolas da propria diretoria, incluindo inativas |
| PASSOU | read | DRE B lista apenas escola B |
| PASSOU | read | Perfil escolar 1 restrito a propria escola |
| PASSOU | read | Perfil escolar 5 restrito a propria escola |
| PASSOU | read | Perfil escolar 6 restrito a propria escola |
| PASSOU | read | Perfil escolar 7 restrito a propria escola |
| PASSOU | read | Escopo de DRE sem unidades retorna vazio, sem acesso global |
| PASSOU | read | Filtro ativa=0 |
| PASSOU | read | Filtros DRE/q e paginacao |
| PASSOU | read | LIKE escapa curingas fornecidos pelo cliente |
| PASSOU | read | Parametros de escopo do navegador nao ampliam territorio |
| PASSOU | read | Consulta individual preserva JSON e timestamps do Express |
| PASSOU | read | Consulta externa e inexistente retornam igualmente 403 |
| PASSOU | read | Seletor de cadastro limitado a DRE ativa autorizada |
| PASSOU | create | Cadastro recalcula endereco/coordenadas/estado e ignora valores forjados |
| PASSOU | create | Escola criada consultavel na propria DRE |
| PASSOU | create | Conflitos de nome e codigo INEP retornam 409, sem duplicar escola |
| PASSOU | departments | Listagem de DRE projeta somente campos publicos |
| PASSOU | departments | Filtro de DRE inativa |
| PASSOU | departments | Cadastro 201 e edicao PUT 200 de DRE com normalizacao |
| PASSOU | departments | Desativacao de DRE sem dependencias |
| PASSOU | departments | Reativacao de DRE; duplicidade entre inativas retorna 409 |
| PASSOU | departments | Dependencias de escola ativa e acesso administrativo impedem desativacao de DRE |
| PASSOU | departments | Vinculo nao encerrado e acesso pendente na escola inativa impedem desativacao |
| PASSOU | rbac | Perfil 1 nao possui escola.criar |
| PASSOU | rbac | Perfil 2 nao possui escola.criar |
| PASSOU | rbac | Perfil 5 nao possui escola.criar |
| PASSOU | rbac | Perfil 6 nao possui escola.criar |
| PASSOU | rbac | Perfil 7 nao possui escola.criar |
| PASSOU | rbac | Perfil 1 nao possui diretoria.gerenciar |
| PASSOU | rbac | Perfil 3 nao possui diretoria.gerenciar |
| PASSOU | rbac | Perfil 4 nao possui diretoria.gerenciar |
| PASSOU | rbac | Perfil 5 nao possui diretoria.gerenciar |
| PASSOU | rbac | Perfil 6 nao possui diretoria.gerenciar |
| PASSOU | rbac | Perfil 7 nao possui diretoria.gerenciar |
| PASSOU | rbac | SEDUC+DRE nao soma capacidade de criar com escopo global |
| PASSOU | rbac | Mutacoes sem capacidade ou fora do territorio nao gravam |
| PASSOU | rbac | Sessao ausente/forjada e identificadores do navegador nao autorizam |
| PASSOU | rollback | Rollback escolar preserva contagem e nao audita sucesso |
| PASSOU | rollback | Rollback cadastro DRE sem registro parcial ou auditoria de sucesso |
| PASSOU | rollback | Rollback edicao/status DRE preserva dados e auditoria |
| PASSOU | race-school | Revogacao durante CEP impede criacao e auditoria de sucesso |
| PASSOU | race-school | DRE desativada enquanto cadastro aguarda lock impede INSERT |
| PASSOU | race-parallel | Cadastros simultaneos de mesma escola: 201+409, sem esgotar pool; recebido [201, 409] |
| PASSOU | race-parallel | Concorrencia cria somente uma escola |
| PASSOU | race-dre | Revogacao durante lock de DRE impede edicao e auditoria |
| PASSOU | race-dre | Revogacao durante lock de DRE impede status e auditoria |
| PASSOU | race-dre | Dependencia criada durante espera do lock impede desativacao da DRE |
| PASSOU | race-dre | DRE removida antes do lock retorna 404 e nao e recriada |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 9 |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 10 |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 11 |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 12 |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 14 |
| PASSOU | sessions | Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido 15 |
| PASSOU | sessions | OAuth state incorreto rejeitado |
| PASSOU | sessions | OAuth state consumido nao pode ser reutilizado |
| PASSOU | sessions | Sessao invalidada na proxima requisicao: ativo=0 |
| PASSOU | sessions | Sessao invalidada na proxima requisicao: data_inicio=CURRENT_DATE-INTERVAL 2 DAY,data_fim=CURRENT_DATE-INTERVAL 1 DAY |
| PASSOU | sessions | Sessao invalidada na proxima requisicao: status='REVOGADO' |
| PASSOU | sessions | Logout de origem valida |
| PASSOU | sessions | Cookie de sessao apos logout nao concede acesso |
| PASSOU | hmac | Cookie publico nao substitui HMAC interno |
| PASSOU | hmac | HMAC valido preserva contrato interno de listagem |
| PASSOU | hmac | Replay HMAC rejeitado |
| PASSOU | hmac | Assinatura adulterada rejeitada |
| PASSOU | hmac | Timestamp HMAC expirado rejeitado |
| PASSOU | hmac | GET interno de DRE assinado inclui query no HMAC |
| PASSOU | hmac | Contrato HMAC preservado: POST /internal/escolas/preview |
| PASSOU | hmac | Contrato HMAC preservado: POST /internal/escolas |
| PASSOU | hmac | Contrato HMAC preservado: POST /internal/diretorias |
| PASSOU | hmac | Contrato HMAC de edicao/status DRE preservado: /internal/diretorias/32 |
| PASSOU | hmac | Contrato HMAC de edicao/status DRE preservado: /internal/diretorias/32/status |
| PASSOU | hmac | Caminho alternativo interno exige HMAC: /internal;probe/escolas/listagem |
| PASSOU | hmac | Caminho alternativo interno exige HMAC: /%69nternal/escolas/listagem |
| PASSOU | infra | Logs nao expoem chaves ou credenciais temporarias |
| PASSOU | cleanup | mysql-dev e node-dev: mesmos IDs, estados, datas de inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Container MySQL temporario removido; processos Java/Python e clientes temporarios encerrados |

Totais desta rodada: PASSOU=82; FALHOU=0; BLOQUEADO=0.
