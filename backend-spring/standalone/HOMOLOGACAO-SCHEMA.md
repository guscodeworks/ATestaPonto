# Validação da inicialização manual do schema standalone

Execução UTC: 2026-10-19, de 23:39:23 a 23:41:09.
Branch mantida: `feat/spring-standalone-schema`.
HEAD: `e89c7ee1692efcc6575c8875e4884dfa076b5bd8`, com as alterações locais
de Compose, inicializador, README e atributos Git preservadas.

Resultado: **PASSOU: 11; FALHOU: 0; BLOQUEADO: 0** no escopo solicitado.
Não foi necessária correção no código. Este relatório é o único arquivo
adicionado nesta etapa. Sem commit, push, merge ou deploy.

## Ambiente e isolamento

- Foram usados somente serviços do Compose standalone, com dois nomes exclusivos:
  `atesta-schema-check-5c3e46bc27` e
  `atesta-schema-check-7b63e46161-partial`.
- Cada projeto teve seus próprios volumes e redes. Nenhum volume existente foi
  reutilizado. Não foram iniciados Node.js, Express, ATestaID ou outro servidor
  MySQL fora desses projetos. `bootstrap-db.py` não foi utilizado.
- Configurações de validação ficaram em diretórios temporários privados fora do
  repositório: credenciais fictícias aleatórias, arquivos de ambiente com modo
  `0600`, endpoints OAuth `.invalid` e SMTP desligado. Nenhum `.env` existente foi
  carregado como configuração da stack.
- A configuração temporária escolheu uma porta Spring livre em loopback. O
  override limitou memória (Spring/MySQL: 512 MiB cada; Redis: 128 MiB) e habilitou o general log
  MySQL em tabela para observar os comandos reais. Também limitou o buffer pool
  MySQL a 64 MiB. Essas configurações não foram incorporadas ao Compose do repo.
- Spring usou a imagem local já disponível
  `atestaponto-spring-standalone:readiness`, fixada no override pelo ID
  `sha256:9f9bbb99026adb7fa46bf96d361e20f7da35aec26c569c5b26e5884da1d08eb6`.
  O MySQL executado foi o mesmo digest fixado no Compose:
  `sha256:24989179f58856db763f418010c1169fecc944e3ec1ea7e921572d83eb070f70`.
  Foram usados `--no-build` e `--pull never`; nenhuma imagem existente foi retaggeada.

## Resultados

| Resultado | Verificação | Evidência observada |
|---|---|---|
| PASSOU | Compose sem opt-in e sem schema automático | `config` sem profile incluiu somente Spring/MySQL/Redis. `up` iniciou os três; `/ready` retornou HTTP 200 `{"status":"UP"}`, enquanto consulta direta confirmou zero tabelas. |
| PASSOU | Rede, portas e volumes | Rede `data` interna e exclusiva. MySQL e Redis sem bindings de porta no host, conectados somente à rede interna. Volumes nomeados pertencentes ao projeto temporário. |
| PASSOU | 1. Inicialização de banco vazio | `run --rm --pull never -T init-schema` terminou com código 0. As 10 tabelas consultadas em `information_schema.tables` coincidiram com o baseline. |
| PASSOU | 2. Chaves e idempotência | Os nomes/tipos de todas as constraints coincidiram com o baseline: 10 PK, 11 UNIQUE, 10 FK e 8 CHECK. Estrutura de `ponto_idempotencia` conferida separadamente. Fixtures inválidas foram recusadas com erros MySQL 1062, 1452 e 3819; as transações foram revertidas, sem registros restantes. |
| PASSOU | 3. Migration incorporada não reaplicada | O general log registrou exatamente 10 novos `CREATE TABLE`, incluindo uma única criação de `ponto_idempotencia`. Zero execuções de `CREATE TABLE IF NOT EXISTS ponto_idempotencia`, instrução da migration incorporada. Definições do baseline e da migration equivalentes após normalização. |
| PASSOU | 4. Segunda inicialização recusada | Nova execução retornou código 1 com a mensagem de recusa. Estrutura e dados continuaram idênticos; nenhum `CREATE TABLE` adicional. |
| PASSOU | 5. Banco parcial recusado sem perda de dados | No segundo projeto, foi aplicada somente a primeira tabela do arquivo canônico, simulando interrupção, e inserido um registro fictício. O inicializador retornou código 1. Permaneceram a mesma tabela e o mesmo registro, com definição e conteúdo idênticos e nenhum DDL adicional. |
| PASSOU | 6. Spring iniciado e `/ready` | Após o baseline, Spring foi iniciado novamente e ficou `healthy`; `/ready` retornou HTTP 200 `{"status":"UP"}`. Consulta SQL independente confirmou as 10 tabelas. O startup não acrescentou DDL. |
| PASSOU | Descarte do projeto parcial | Containers, rede e volume próprios removidos; nenhum recurso com a label desse projeto permaneceu. |
| PASSOU | Descarte do projeto principal | Containers, redes e volumes próprios removidos; nenhum recurso com a label desse projeto permaneceu. |
| PASSOU | Preservação dos ambientes existentes | Inventário restaurado: 2 containers, 29 volumes e 4 redes, com os mesmos IDs/nomes. Comparação dos containers existentes e hashes dos 529 arquivos existentes, incluindo `.env`, sem alterações. |

As 10 tabelas consultadas foram `acessos_administrativos`, `cargos`,
`diretorias_ensino`, `funcionarios`, `login_funcionario`, `ponto_idempotencia`,
`registro_de_pontos`, `unidades_escolares`, `usuarios_administrativos` e
`vinculos_funcionais`.

Em `ponto_idempotencia`, foram conferidos a PK composta `(funcionario_id, chave)`,
`funcionario_id BIGINT UNSIGNED`, `chave CHAR(36)` e `requisicao_hash CHAR(64)` com
charset `ascii`/collation `ascii_bin`, `resposta JSON` e todas as colunas `NOT NULL`.
A tentativa de repetir a mesma PK foi recusada pelo MySQL.

O baseline foi lido diretamente de
`atesta-gateway/database/schema/ponto.sql`, montado somente para leitura pelo
Compose original. SHA-256:
`0a642abc1401dd6cce405182e13e28d6e48a468f2f7e1944cc0872a83079b715`.
Nenhuma cópia de SQL ou migration foi adicionada ao repositório.

O cenário parcial terminou com 1 tabela e 1 registro, exatamente como antes da
recusa. Foram comparados `SHOW CREATE TABLE` e o conteúdo da tabela, incluindo
seus timestamps. A fixture usou apenas dados fictícios de uma diretoria.

## Preservação e descarte

Antes da execução foram registrados os IDs e hashes da configuração dos containers
existentes, seus volumes, redes, estado, início, PID e contagem de reinícios.
A comparação final confirmou `mysql-dev` e `node-dev` preservados. Nenhuma
consulta de domínio, login, escrita ou reinicialização foi feita nesses serviços.
Os arquivos `.env` existentes foram apenas comparados por hash, sem impressão de
seus conteúdos.

O descarte usou `down --volumes --remove-orphans` somente nos dois projetos
aleatórios acima, após verificar labels e prefixos dos recursos. Não houve prune,
remoção de imagens ou limpeza global. Configurações e credenciais temporárias
foram descartadas. A comparação dos arquivos foi concluída antes da criação
deste relatório; os quatro arquivos alterados/criados na etapa anterior foram
preservados.

## Limitações

- `/ready` verifica conectividade MySQL/Redis; respondeu UP também com zero
  tabelas. A prova de schema veio das consultas SQL e do log de DDL.
- A imagem Spring local indicada acima foi executada sem recompilação nesta
  etapa. A validação cobre sua integração real com o Compose e o schema; não
  constitui validação de um novo build.
- Não foram exercitados escritores concorrentes. A verificação de banco vazio
  não bloqueia outras sessões; execute a inicialização com uso exclusivo do banco.
- DDL MySQL não possui rollback. O caso parcial foi simulado após a primeira
  tabela; não houve injeção de queda de energia ou falha física durante a importação.
  Uma recuperação continua exigindo revisão manual autorizada.
- O schema é estrutural. OAuth real, SMTP, fluxos de negócio, carga e migrations
  futuras não fazem parte desta validação.

## Revisão para publicação

Após a validação acima, o usuário autorizou commit, push e abertura de PR para
`develop`, condicionados aos testes aprovados e à ausência de alterações de
terceiros. O diff foi relido: somente os cinco arquivos desta tarefa em
`backend-spring/standalone` estavam alterados ou não rastreados, sem alterações
de terceiros identificadas. O remoto `develop` permanecia em
`e89c7ee1692efcc6575c8875e4884dfa076b5bd8`; a branch da tarefa ainda não existia
no remoto. Nenhuma bateria aprovada, incluindo os 34 testes HTTP anteriores,
foi repetida para publicar. Merge, force push e deploy não estão autorizados.

Estados dos previews antigos, consultados somente pelos metadados dos checks
no GitHub em 2026-10-19 UTC, antes da publicação desta branch:

| PR anterior | Vercel – atestaponto | Vercel – atestaponto-auth-simulator | Vercel Preview Comments |
|---|---|---|---|
| [#171](https://github.com/guscodeworks/ATestaPonto/pull/171) | FAILURE | FAILURE | SUCCESS |
| [#170](https://github.com/guscodeworks/ATestaPonto/pull/170) | FAILURE | FAILURE | SUCCESS |
| [#169](https://github.com/guscodeworks/ATestaPonto/pull/169) | FAILURE | FAILURE | SUCCESS |
| [#168](https://github.com/guscodeworks/ATestaPonto/pull/168) | FAILURE | FAILURE | SUCCESS |
| [#167](https://github.com/guscodeworks/ATestaPonto/pull/167) | FAILURE | FAILURE | SUCCESS |

Esses previews não foram abertos, investigados, reexecutados ou usados como
aprovação de produção. O sucesso de `Preview Comments` apenas registra o check
de comentários; não comprova o sucesso do preview ou do schema MySQL. Os testes
standalone aprovados acima sustentam somente o escopo desta alteração.
