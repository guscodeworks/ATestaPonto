# Homologação — bootstrap isolado do MySQL

Rodada final iniciada em 2026-10-19T23:02:23.112855+00:00. Branch `feat/spring-db-bootstrap`; HEAD `38d099b9bc2e6ccfc1ff959e60e9b9a067ddbe59`.

Linux x86_64, Python 3.14.8, MySQL 8.4.10. Imagem local `mysql:8.4`:
`sha256:563602a18ffd5be220968e8508d84c9dcd80fbffe69e28af51572db29e3285b2`. Nenhuma imagem baixada ou dependência instalada.

**Resultado:** os seis itens solicitados PASSARAM. Foram concluídas 28 verificações na rodada integrada e 5 verificações complementares. A ferramenta e seu manual permaneceram byte a byte iguais; somente este relatório foi adicionado ao repositório.

## Resultado por item

| Estado | Item | Evidência objetiva |
|---|---|---|
| PASSOU | 1. Criação das tabelas | Exatamente 10 tabelas, nenhuma extra; 0 linhas por tabela antes das fixtures. |
| PASSOU | 2. Estrutura e chaves | 86 colunas; tipos, ordem, nulabilidade, defaults, auto_increment e ON UPDATE comparados ao SQL canônico; 33 índices, incluindo 10 PK e 21 índices únicos contando PK; 10 FKs e 8 CHECKs ativos. Todas as tabelas InnoDB. |
| PASSOU | 3. Migrations incorporadas | Trace das chamadas reais ao Docker: baseline aplicado 1 vez; migration aplicada 0 vezes; 10 CREATE TABLE. DDL de ponto_idempotencia equivalente nos dois arquivos. |
| PASSOU | 4. Banco não vazio | Banco próprio pré-criado com tabela sentinel e registro 42: erro MySQL 1007, saída da ferramenta 1; tabela e registro preservados antes do descarte. Banco existente vazio também recusado. |
| PASSOU | 5. Conexão externa | --host, --port, --database, --url, --container e --password: saída 2 sem qualquer chamada Docker. DB_* e DOCKER_HOST/DOCKER_CONTEXT sentinelas externos ignorados na execução real. |
| PASSOU | 6. Limpeza | Ctrl+C e SIGTERM: saída 0; erro de banco existente: saída 1; em todos os casos docker rm --force --volumes retornou 0. Containers, volumes, redes e pastas de credenciais temporárias voltaram ao inventário anterior. |
| PASSOU | Sem Node.js | Ferramenta executada com PATH contendo apenas wrapper Python/Docker; node ausente desse PATH. Nenhum Node, npm, Maven, Spring, login ou simulador iniciado. |
| PASSOU | Conexão de cliente | Cliente MySQL descartável em rede do host autenticou pela porta publicada em 127.0.0.1, usando o usuário e a senha gerados; SELECT VERSION(), DATABASE() conferido. |
| PASSOU | Preservação | 513 arquivos comparados por SHA-256, incluindo 3 arquivos .env, baseline, migration, script e manual; todos idênticos. mysql-dev/node-dev mantiveram ID, estado, início e reinícios. |

## Método e escopo das escritas

Foi executado o script original `backend-spring/scripts/bootstrap-db.py`. Um wrapper Python temporário chamado `docker`, colocado no PATH exclusivo do processo, encaminhou as chamadas para o Docker real no socket local e registrou argumentos sem segredos, hashes dos comandos SQL, quantidade de CREATE TABLE e códigos de saída. As senhas permaneceram no ambiente dos processos e no arquivo temporário privado da ferramenta; não foram registradas neste relatório.

Somente nos cenários de recusa, o wrapper inseriu a fixture imediatamente antes do CREATE DATABASE da ferramenta: primeiro criou o banco com o nome que a própria ferramenta gerou; no cenário não vazio, criou uma tabela sentinel com um registro fictício. Depois encaminhou o CREATE DATABASE original, verificou o erro 1007 e consultou a fixture antes da limpeza automática. O trace confirmou que o baseline não chegou a ser aplicado nesses cenários. Nenhum banco pré-existente do ambiente foi usado como alvo.

No cenário de sucesso, foram inseridos registros exclusivamente fictícios nas 10 tabelas, sem autenticar pessoas nem iniciar aplicações. As escritas foram executadas apenas no ID do container criado pela ferramenta, com o usuário gerado para esse banco.

O inventário Docker anterior foi comparado ao posterior: IDs de containers, volumes e redes; para mysql-dev/node-dev também estado, horário de início e reinícios. Nesses ambientes existentes foram lidos apenas metadados Docker, sem conexão ou SQL nos bancos.

## Estrutura observada

| Tabela | Colunas | PK | Índices totais | FKs |
|---|---:|---|---:|---:|
| acessos_administrativos | 11 | id | 6 | 4 |
| cargos | 5 | id | 2 | 0 |
| diretorias_ensino | 7 | id | 3 | 0 |
| funcionarios | 9 | id | 3 | 0 |
| login_funcionario | 9 | id | 2 | 1 |
| ponto_idempotencia | 4 | funcionario_id,chave | 1 | 0 |
| registro_de_pontos | 7 | id | 4 | 1 |
| unidades_escolares | 12 | id | 3 | 1 |
| usuarios_administrativos | 8 | id | 3 | 0 |
| vinculos_funcionais | 14 | id | 6 | 3 |

As 23 colunas textuais têm a collation esperada: utf8mb4_unicode_ci; chave/requisicao_hash em ponto_idempotencia usam ascii_bin. A resposta da idempotência é JSON, com PK composta (funcionario_id, chave). As ações referenciais CASCADE, RESTRICT e SET NULL foram comparadas aos comandos canônicos.

## Integridade com dados fictícios

| Tentativa inválida | Erro MySQL observado |
|---|---:|
| Ponto com vínculo inexistente | 1452 |
| CPF, ponto do mesmo tipo/dia/vínculo ou chave de idempotência duplicados | 1062 |
| Latitude fora do intervalo, raio negativo ou perfil escolar sem escopo | 3819 |
| Resposta de idempotência com JSON inválido | 3140 |
| Exclusão de funcionário ainda vinculado | 1451 |

As inserções válidas produziram 1 registro por tabela. As tentativas inválidas foram rejeitadas pelo MySQL real; não foram respostas simuladas.

## Migrations e arquivos de referência

- Baseline `atesta-gateway/database/schema/ponto.sql`: SHA-256 `0a642abc1401dd6cce405182e13e28d6e48a468f2f7e1944cc0872a83079b715`.
- Migration `atesta-gateway/database/migrations/20260908_ponto_idempotencia.sql`: SHA-256 `ebc2abdca29e00e06bb8186da6ca96fd2672ce3c8eebe297b265588a3f1973aa`.
- A definição de ponto_idempotencia nos dois arquivos coincide após remover comentários, backticks, espaços e IF NOT EXISTS. A migration não foi reaplicada.
- Em cópias temporárias, migration nova e migration alterada foram recusadas antes de acessar Docker. Cópias CRLF com BOM UTF-8 foram aceitas. Os arquivos canônicos não foram editados.

## Preservação e descarte

Metadados idênticos antes e depois (nome, ID, estado, início, reinícios):

```text
/mysql-dev e82a94e0d1bd9455d2e62b6d7739138869d7bc8463f3f50ef3598f5cc37d49e5 running 2026-10-19T22:37:18.305814457Z 0
/node-dev 15f017dadab7a3c300eca71db65b36a1f02dee19e80eaffb00938d0b87a98fe2 running 2026-10-19T22:37:17.978530007Z 0
```

Inventário restaurado: 2 containers, 29 volumes e 4 redes. Nenhuma pasta atesta-db-bootstrap-* adicional permaneceu. Os quatro processos da rodada final encerraram; os containers de rodadas preliminares também foram removidos.

O container MySQL foi verificado com dados em tmpfs de 512 MiB, limite de memória de 768 MiB e publicação apenas em 127.0.0.1. O arquivo database.env tinha modo 0600 e sua pasta 0700; ambos desapareceram no descarte. O cliente auxiliar usou --rm e não deixou volumes.

## FALHOU e BLOQUEADO

| Estado | Ocorrência | Situação final |
|---|---|---|
| FALHOU — verificador temporário | Rodadas preliminares interrompidas por interpretação do ENUM multilinha, normalização de metadados MySQL e erros de consulta/sintaxe no próprio verificador. | Corrigidos somente em /tmp; comparações repetidas, incluindo preflight com metadados reais. Rodada final: 28 PASSOU, 0 FALHOU. Nenhuma alteração na ferramenta foi necessária. |
| FALHOU — ferramenta | Nenhuma falha identificada nos seis itens e cenários executados. | Nenhuma correção de código aplicada. |
| BLOQUEADO — Windows | Named pipe/ACLs do Windows indisponíveis neste host Linux. | Caminho Windows não homologado; não bloqueia o resultado Linux. |

## Reproduzir e limites

Pré-requisitos e descarte estão em [DB-BOOTSTRAP.md](DB-BOOTSTRAP.md). Na raiz do checkout, iniciar manualmente:

```bash
python3 backend-spring/scripts/bootstrap-db.py
```

Carregar o database.env temporário indicado pela ferramenta em um cliente isolado. Consultas úteis para repetir a inspeção no banco descartável:

```sql
SHOW TABLES;
SHOW CREATE TABLE ponto_idempotencia;
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, ORDINAL_POSITION;
SELECT CONSTRAINT_TYPE, COUNT(*) FROM information_schema.table_constraints
WHERE CONSTRAINT_SCHEMA = DATABASE() GROUP BY CONSTRAINT_TYPE;
```

Os cenários de colisão de banco foram feitos por injeção de fixture no wrapper, pois a CLI intencionalmente não aceita selecionar banco/container existente. Não introduzir opções de conexão externa para reproduzir esse teste.

Homologação restrita a Linux amd64/MySQL 8.4.10 e à imagem identificada acima. Docker remoto, sockets alternativos e SIGKILL/queda do daemon não foram exercitados; a ferramenta documenta limpeza manual para interrupções não tratáveis. Não foram executados testes gerais de Node ou Spring. PR #169, commits, push, merge e deploy não foram modificados/executados.

<details>
<summary>Metadados SQL coletados na rodada final</summary>

Colunas: tabela, coluna, tipo, nullable, extra, collation, default (NULL sem collation; &lt;NULL&gt; sem default).

```text
acessos_administrativos	id	bigint unsigned	NO	auto_increment	NULL	<NULL>
acessos_administrativos	usuario_administrativo_id	bigint unsigned	NO		NULL	<NULL>
acessos_administrativos	perfil	enum('ADMIN_SEDUC','ADMIN_DIRETORIA','DIRETOR','VICE_DIRETOR','SECRETARIA','COORDENADOR')	NO		utf8mb4_unicode_ci	<NULL>
acessos_administrativos	diretoria_ensino_id	int unsigned	YES		NULL	<NULL>
acessos_administrativos	unidade_escolar_id	int	YES		NULL	<NULL>
acessos_administrativos	status	enum('PENDENTE','ATIVO','SUSPENSO','REVOGADO')	NO		utf8mb4_unicode_ci	PENDENTE
acessos_administrativos	data_inicio	date	NO	DEFAULT_GENERATED	NULL	curdate()
acessos_administrativos	data_fim	date	YES		NULL	<NULL>
acessos_administrativos	concedido_por_acesso_id	bigint unsigned	YES		NULL	<NULL>
acessos_administrativos	criado_em	datetime	NO	DEFAULT_GENERATED	NULL	CURRENT_TIMESTAMP
acessos_administrativos	atualizado_em	datetime	NO	DEFAULT_GENERATED on update CURRENT_TIMESTAMP	NULL	CURRENT_TIMESTAMP
cargos	id	bigint unsigned	NO	auto_increment	NULL	<NULL>
cargos	cargo	varchar(80)	NO		utf8mb4_unicode_ci	<NULL>
cargos	ativo	tinyint(1)	NO		NULL	1
cargos	criado_em	datetime	NO	DEFAULT_GENERATED	NULL	CURRENT_TIMESTAMP
cargos	atualizado_em	datetime	NO	DEFAULT_GENERATED on update CURRENT_TIMESTAMP	NULL	CURRENT_TIMESTAMP
diretorias_ensino	id	int unsigned	NO	auto_increment	NULL	<NULL>
diretorias_ensino	nome	varchar(150)	NO		utf8mb4_unicode_ci	<NULL>
diretorias_ensino	codigo	varchar(50)	NO		utf8mb4_unicode_ci	<NULL>
diretorias_ensino	cidade_sede	varchar(100)	NO		utf8mb4_unicode_ci	Campinas
diretorias_ensino	ativo	tinyint(1)	NO		NULL	1
diretorias_ensino	criado_em	datetime	NO	DEFAULT_GENERATED	NULL	CURRENT_TIMESTAMP
diretorias_ensino	atualizado_em	datetime	NO	DEFAULT_GENERATED on update CURRENT_TIMESTAMP	NULL	CURRENT_TIMESTAMP
funcionarios	id	bigint unsigned	NO	auto_increment	NULL	<NULL>
funcionarios	cpf	char(11)	NO		utf8mb4_unicode_ci	<NULL>
funcionarios	email	varchar(150)	NO		utf8mb4_unicode_ci	<NULL>
funcionarios	nome	varchar(150)	NO		utf8mb4_unicode_ci	<NULL>
funcionarios	telefone	varchar(20)	YES		utf8mb4_unicode_ci	<NULL>
funcionarios	ativo	tinyint(1)	NO		NULL	1
funcionarios	desativado_em	datetime	YES		NULL	<NULL>
funcionarios	criado_em	datetime	NO	DEFAULT_GENERATED	NULL	CURRENT_TIMESTAMP
funcionarios	atualizado_em	datetime	NO	DEFAULT_GENERATED on update CURRENT_TIMESTAMP	NULL	CURRENT_TIMESTAMP
login_funcionario	id	bigint unsigned	NO	auto_increment	NULL	<NULL>
login_funcionario	funcionario_id	bigint unsigned	NO		NULL	<NULL>
login_funcionario	senha_hash	varchar(255)	NO		utf8mb4_unicode_ci	<NULL>
login_funcionario	primeiro_acesso	tinyint(1)	NO		NULL	1
login_funcionario	senha_temporaria_expira_em	datetime	YES		NULL	<NULL>
login_funcionario	senha_alterada_em	datetime	YES		NULL	<NULL>
login_funcionario	ultimo_login_em	datetime	YES		NULL	<NULL>
login_funcionario	criado_em	datetime	NO	DEFAULT_GENERATED	NULL	CURRENT_TIMESTAMP
login_funcionario	atualizado_em	datetime	NO	DEFAULT_GENERATED on update CURRENT_TIMESTAMP	NULL	CURRENT_TIMESTAMP
ponto_idempotencia	funcionario_id	bigint unsigned	NO		NULL	<NULL>
ponto_idempotencia	chave	char(36)	NO		ascii_bin	<NULL>
ponto_idempotencia	requisicao_hash	char(64)	NO		ascii_bin	<NULL>
ponto_idempotencia	resposta	json	NO		NULL	<NULL>
registro_de_pontos	id	bigint unsigned	NO	auto_increment	NULL	<NULL>
registro_de_pontos	vinculo_funcional_id	bigint unsigned	NO		NULL	<NULL>
registro_de_pontos	data_referencia	date	NO		NULL	<NULL>
registro_de_pontos	tipo	enum('ENTRADA','SAIDA_ALMOCO','RETORNO_ALMOCO','SAIDA')	NO		utf8mb4_unicode_ci	<NULL>
registro_de_pontos	registrado_em	datetime	NO	DEFAULT_GENERATED	NULL	CURRENT_TIMESTAMP
registro_de_pontos	created_at	datetime	NO	DEFAULT_GENERATED	NULL	CURRENT_TIMESTAMP
registro_de_pontos	updated_at	datetime	NO	DEFAULT_GENERATED on update CURRENT_TIMESTAMP	NULL	CURRENT_TIMESTAMP
unidades_escolares	id	int	NO	auto_increment	NULL	<NULL>
unidades_escolares	diretoria_ensino_id	int unsigned	NO		NULL	<NULL>
unidades_escolares	nome	varchar(150)	NO		utf8mb4_unicode_ci	<NULL>
unidades_escolares	latitude	decimal(10,8)	NO		NULL	<NULL>
unidades_escolares	longitude	decimal(11,8)	NO		NULL	<NULL>
unidades_escolares	raio_permitido_metros	int	NO		NULL	100
unidades_escolares	ativa	tinyint(1)	NO		NULL	1
unidades_escolares	criado_em	datetime	NO	DEFAULT_GENERATED	NULL	CURRENT_TIMESTAMP
unidades_escolares	atualizado_em	datetime	NO	DEFAULT_GENERATED on update CURRENT_TIMESTAMP	NULL	CURRENT_TIMESTAMP
unidades_escolares	codigo_inep	varchar(20)	YES		utf8mb4_unicode_ci	<NULL>
unidades_escolares	endereco	varchar(255)	YES		utf8mb4_unicode_ci	<NULL>
unidades_escolares	cidade	varchar(100)	NO		utf8mb4_unicode_ci	Campinas
usuarios_administrativos	id	bigint unsigned	NO	auto_increment	NULL	<NULL>
usuarios_administrativos	cpf	char(11)	NO		utf8mb4_unicode_ci	<NULL>
usuarios_administrativos	nome	varchar(150)	NO		utf8mb4_unicode_ci	<NULL>
usuarios_administrativos	email	varchar(150)	YES		utf8mb4_unicode_ci	<NULL>
usuarios_administrativos	ativo	tinyint(1)	NO		NULL	1
usuarios_administrativos	ultimo_login_em	datetime	YES		NULL	<NULL>
usuarios_administrativos	criado_em	datetime	NO	DEFAULT_GENERATED	NULL	CURRENT_TIMESTAMP
usuarios_administrativos	atualizado_em	datetime	NO	DEFAULT_GENERATED on update CURRENT_TIMESTAMP	NULL	CURRENT_TIMESTAMP
vinculos_funcionais	id	bigint unsigned	NO	auto_increment	NULL	<NULL>
vinculos_funcionais	funcionario_id	bigint unsigned	NO		NULL	<NULL>
vinculos_funcionais	unidade_escolar_id	int	NO		NULL	<NULL>
vinculos_funcionais	cargo_id	bigint unsigned	NO		NULL	<NULL>
vinculos_funcionais	matricula	varchar(50)	YES		utf8mb4_unicode_ci	<NULL>
vinculos_funcionais	horario_entrada	time	NO		NULL	<NULL>
vinculos_funcionais	horario_saida_almoco	time	NO		NULL	<NULL>
vinculos_funcionais	horario_volta_almoco	time	NO		NULL	<NULL>
vinculos_funcionais	horario_saida	time	NO		NULL	<NULL>
vinculos_funcionais	data_inicio	date	NO		NULL	<NULL>
vinculos_funcionais	data_fim	date	YES		NULL	<NULL>
vinculos_funcionais	status	enum('ATIVO','AFASTADO','ENCERRADO')	NO		utf8mb4_unicode_ci	ATIVO
vinculos_funcionais	criado_em	datetime	NO	DEFAULT_GENERATED	NULL	CURRENT_TIMESTAMP
vinculos_funcionais	atualizado_em	datetime	NO	DEFAULT_GENERATED on update CURRENT_TIMESTAMP	NULL	CURRENT_TIMESTAMP
```

Índices: tabela, nome, non_unique, colunas em ordem.

```text
acessos_administrativos	idx_acessos_concedido_por	1	concedido_por_acesso_id
acessos_administrativos	idx_acessos_diretoria	1	diretoria_ensino_id
acessos_administrativos	idx_acessos_status	1	status
acessos_administrativos	idx_acessos_unidade	1	unidade_escolar_id
acessos_administrativos	idx_acessos_usuario	1	usuario_administrativo_id
acessos_administrativos	PRIMARY	0	id
cargos	PRIMARY	0	id
cargos	uq_cargos_cargo	0	cargo
diretorias_ensino	PRIMARY	0	id
diretorias_ensino	uk_diretorias_ensino_codigo	0	codigo
diretorias_ensino	uk_diretorias_ensino_nome	0	nome
funcionarios	cpf	0	cpf
funcionarios	email	0	email
funcionarios	PRIMARY	0	id
login_funcionario	funcionario_id	0	funcionario_id
login_funcionario	PRIMARY	0	id
ponto_idempotencia	PRIMARY	0	funcionario_id,chave
registro_de_pontos	idx_registro_data_referencia	1	data_referencia
registro_de_pontos	idx_registro_vinculo_data	1	vinculo_funcional_id,data_referencia
registro_de_pontos	PRIMARY	0	id
registro_de_pontos	uq_registro_vinculo_data_tipo	0	vinculo_funcional_id,data_referencia,tipo
unidades_escolares	idx_unidades_diretoria	1	diretoria_ensino_id
unidades_escolares	PRIMARY	0	id
unidades_escolares	uk_unidades_codigo_inep	0	codigo_inep
usuarios_administrativos	PRIMARY	0	id
usuarios_administrativos	uq_usuarios_admin_cpf	0	cpf
usuarios_administrativos	uq_usuarios_admin_email	0	email
vinculos_funcionais	idx_vinculos_cargo	1	cargo_id
vinculos_funcionais	idx_vinculos_funcionario	1	funcionario_id
vinculos_funcionais	idx_vinculos_status	1	status
vinculos_funcionais	idx_vinculos_unidade_escolar	1	unidade_escolar_id
vinculos_funcionais	PRIMARY	0	id
vinculos_funcionais	uq_vinculos_unidade_matricula	0	unidade_escolar_id,matricula
```

FKs: tabela, constraint, coluna, tabela referenciada, coluna referenciada, regra DELETE, regra UPDATE.

```text
acessos_administrativos	fk_acessos_concedido_por	concedido_por_acesso_id	acessos_administrativos	id	SET NULL	CASCADE
acessos_administrativos	fk_acessos_diretoria	diretoria_ensino_id	diretorias_ensino	id	RESTRICT	RESTRICT
acessos_administrativos	fk_acessos_unidade	unidade_escolar_id	unidades_escolares	id	RESTRICT	RESTRICT
acessos_administrativos	fk_acessos_usuario	usuario_administrativo_id	usuarios_administrativos	id	RESTRICT	CASCADE
login_funcionario	fk_login_funcionario	funcionario_id	funcionarios	id	CASCADE	CASCADE
registro_de_pontos	fk_registro_vinculo_funcional	vinculo_funcional_id	vinculos_funcionais	id	RESTRICT	CASCADE
unidades_escolares	fk_unidades_diretoria	diretoria_ensino_id	diretorias_ensino	id	RESTRICT	CASCADE
vinculos_funcionais	fk_vinculos_cargo	cargo_id	cargos	id	RESTRICT	CASCADE
vinculos_funcionais	fk_vinculos_funcionario	funcionario_id	funcionarios	id	RESTRICT	CASCADE
vinculos_funcionais	fk_vinculos_unidade_escolar	unidade_escolar_id	unidades_escolares	id	RESTRICT	CASCADE
```

CHECKs: constraint, enforced.

```text
chk_acessos_escopo	YES
chk_acessos_periodo	YES
chk_unidade_latitude	YES
chk_unidade_longitude	YES
chk_unidade_raio	YES
chk_usuarios_admin_ativo	YES
chk_usuarios_admin_cpf	YES
chk_vinculos_periodo	YES
```

</details>
