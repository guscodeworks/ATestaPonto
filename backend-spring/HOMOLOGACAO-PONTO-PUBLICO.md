# Homologacao — ponto e autenticacao publicos no Spring

Java 21; Spring/JDBC reais; MySQL 8.4 tmpfs e Redis 7 temporarios; SMTP/Gov.br Python locais.
HTTP direto no Spring, sem gateway Express. Dados exclusivamente ficticios, sem carregar .env.

Reproduzir: `cd backend-spring && ./mvnw -o -DskipTests package && python3 scripts/check-public-punch.py`.
Reexecucao seletiva: `python3 scripts/check-public-punch.py --only qr,geo`.
Requer Docker, imagens locais e bibliotecas Node instaladas para checagem BCrypt/JWT.
A fixture injeta cookies QR assinados e registros Redis compativeis sem usar paginas Express.
Schema, triggers de falha e todos os dados existem somente no MySQL temporario.
Sem commit, merge ou deploy.

## Resultado final — PASSOU

- **PASSOU:** os 14 grupos funcionais pedidos, com Spring Boot real, JDBC e
  schema canônico no MySQL temporário; nenhum mock dos serviços de domínio.
- **FALHOU:** zero pendências. Uma falha real de startup foi corrigida.
- **BLOQUEADO:** zero pendências. Os grupos inicialmente bloqueados pelo startup
  foram executados após a correção.
- Java **21.0.12.1**, Spring Boot 3.5.16, MySQL 8.4 e Redis 7.
  `./mvnw -o -DskipTests package`: **BUILD SUCCESS**. O Maven empacota o código;
  as verificações de integração são executadas pelo script Python abaixo.

| Grupo | Final |
|---|---|
| Login CPF/e-mail, aliases, senha errada, BCrypt 2a/2b/UTF-8, elegibilidade | PASSOU |
| JWT válido, expirado, adulterado, futuro, role/versão e funcionário inativo | PASSOU |
| Primeiro acesso, troca única, concorrência e revogação da credencial antiga | PASSOU |
| Recuperação SMTP, expiração, cinco tentativas, reenvio e consumo concorrente | PASSOU |
| QR válido, outra escola, revogação, TTL, contexto residual e cookies separados | PASSOU |
| Registrar/bater, hoje, histórico e vínculos/transferências | PASSOU |
| Geolocalização, precisão, margem, coordenadas e idade do GPS | PASSOU |
| Idempotência entre aliases, UUID maiúsculo, conflito e replay legado | PASSOU |
| Concorrência MySQL com chaves iguais e diferentes | PASSOU |
| Rollback real de ponto/idempotência e alterações de senha | PASSOU |
| Auditoria, ausência de duplicação e redação de segredos | PASSOU |
| Rate limiting, cabeçalhos, janela, desconto e Redis indisponível | PASSOU |
| Sessão administrativa Gov.br independente do funcionário/recuperação | PASSOU |
| HMAC interno, corpo/timestamp e anti-replay | PASSOU |

### Falhas e reexecução seletiva

1. **Produto:** o nome padrão do bean de configuração `PublicPunchSecurity`
   colidia com o método `@Bean publicPunchSecurity`. A aplicação empacotada
   encerrava antes do servidor HTTP iniciar. Correção mínima: renomear o método
   para `publicPunchSecurityChain`. Recompilação Java 21 e execução dos 14 grupos
   antes bloqueados confirmaram o startup e os fluxos reais.
2. **Harness:** a primeira verificação de cabeçalhos consultava apenas o primeiro
   `RateLimit-Policy`, correspondente a `ip-abuse`, embora a resposta 429 por
   identidade estivesse correta. A leitura passou a usar `get_all` para os
   cabeçalhos repetidos. Foi repetido **somente `--only limites`**: 13 verificações
   aprovadas (infra, nove casos de limites e limpeza), sem alterar o produto.
   Os demais grupos já aprovados não foram repetidos.

As tabelas cronológicas abaixo preservam os resultados iniciais, inclusive as
falhas e bloqueios resolvidos. A rodada funcional teve 97 verificações aprovadas
antes da correção da leitura de cabeçalhos; a rodada seletiva aprovou esse caso
e os cenários restantes de limites.

### Isolamento, configuração e limites da homologação

- Em todas as rodadas, `mysql-dev` e `node-dev` mantiveram ID, estado, data de
  início e contador de reinícios; os arquivos `.env` mantiveram hashes idênticos.
- MySQL usa tmpfs e dados gerados; Redis não persiste disco. Triggers para
  provocar falhas existem apenas nesse MySQL. Containers/processos/servidores
  temporários foram removidos após cada rodada, inclusive nas falhas.
- Gov.br e SMTP são servidores Python locais. O SMTP recebeu os códigos que
  foram usados nos endpoints reais; não houve contato com provedores reais.
- Node executa somente BCrypt/jsonwebtoken instalados para interoperabilidade;
  não inicia Express, gateway ou simulador ATestaID. O QR é gerado pelo endpoint
  HMAC Spring; a fixture injeta o cookie assinado e a sessão Redis no formato
  original, sem depender das páginas Express.
- Para tornar limites determinísticos, a fixture configura rounds BCrypt 10,
  atraso de login inválido 10 ms, IP 100, falhas/IP 10 e ponto 50/60 s. As cotas
  de recuperação 5 e sensível 40 permanecem iguais às de produção. A liberação
  da janela de ponto é verificada expirando somente sua chave no Redis isolado.
- Não houve commit, merge, push ou deploy. Integrações reais e carga prolongada
  não fazem parte desta homologação.

### Arquivos alterados nesta homologação

- `src/main/java/br/com/atestaponto/publicpunch/config/PublicPunchSecurity.java`:
  correção do nome do bean de filtros.
- `scripts/check-public-punch.py`: harness reproduzível e grupos seletivos.
- `HOMOLOGACAO-PONTO-PUBLICO.md`: este relatório e histórico das rodadas.
- `PONTO-PUBLICO.md`: referência ao resultado da homologação real.

## Rodada UTC 2026-10-18T18:55:29.051617+00:00

Grupos: todos. Requisicoes instrumentadas: 0.

| Resultado | Grupo | Cenario |
|---|---|---|
| FALHOU | infra | Spring Boot encerrou no startup por BeanDefinitionOverrideException: colisao entre o bean de configuracao PublicPunchSecurity e o metodo publicPunchSecurity. Corrigido pelo nome publicPunchSecurityChain; detalhes da correcao e reexecucao acima. |
| BLOQUEADO | login | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | jwt | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | primeiro-acesso | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | recuperacao | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | qr | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | ponto | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | geo | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | idempotencia | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | concorrencia | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | rollback | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | auditoria | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | limites | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | isolamento | Fixture/infra indisponivel nesta rodada |
| BLOQUEADO | hmac | Fixture/infra indisponivel nesta rodada |
| PASSOU | cleanup | mysql-dev e node-dev preservados: IDs, estado, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Containers e processos temporarios removidos |

Totais: PASSOU=3; FALHOU=1; BLOQUEADO=14.

## Rodada UTC 2026-10-18T18:57:59.206760+00:00

Grupos: todos. Requisicoes instrumentadas: 155.

| Resultado | Grupo | Cenario |
|---|---|---|
| PASSOU | infra | Java 21, Spring real e JDBC/MySQL 8.4/Redis 7/SMTP/Gov.br isolados; sem Express |
| PASSOU | login | Login CPF formatado: contrato normal, CPF mascarado e sem hash |
| PASSOU | login | Projecao de identidade publica preservada |
| PASSOU | login | Login e-mail/alias identificador normalizado |
| PASSOU | login | Login e-mail/alias login normalizado |
| PASSOU | login | Login e-mail/alias email normalizado |
| PASSOU | login | Login confirmado persiste ultimo_login_em |
| PASSOU | login | Senha errada, inexistente, inativo, sem vinculo e temporaria vencida: mesmo 401 |
| PASSOU | login | Login recusado nao altera ultimo_login_em |
| PASSOU | login | CPF invalido e senha curta: validacao 422 |
| PASSOU | login | BCrypt Node: corte em 72 bytes no meio de UTF-8 aceito pelo Spring |
| PASSOU | login | Hashes BCrypt 2a/2b reais e rounds 10 compativeis |
| PASSOU | jwt | Node verifica JWT Spring e HMAC da credencial persistida |
| PASSOU | jwt | JWT expirado, adulterado, malformado, futuro e sem versao de credencial: 401 |
| PASSOU | jwt | Role administrativa no JWT nao concede acesso de funcionario |
| PASSOU | jwt | Funcionario desativado apos emissao perde acesso a consultas e ponto |
| PASSOU | primeiro-acesso | Primeiro acesso emite somente comprovante; nao grava login normal |
| PASSOU | primeiro-acesso | JWT de primeiro acesso usa a chave derivada compativel com Node |
| PASSOU | primeiro-acesso | Comprovante nao autentica ponto; JWT normal/expirado nao autoriza primeira troca |
| PASSOU | primeiro-acesso | Troca BCrypt atomica limpa senha temporaria e primeiro acesso |
| PASSOU | primeiro-acesso | Senha temporaria e JWT antigo recusados; nova senha autentica |
| PASSOU | primeiro-acesso | Quatro trocas concorrentes: uma confirma, tres conflitos |
| PASSOU | recuperacao | Solicitacao 202 generica, pelo menos 300 ms e codigo entregue pelo SMTP local |
| PASSOU | recuperacao | Cookie de recuperacao separado, atributos e TTL de 15 minutos |
| PASSOU | recuperacao | Redis persiste somente hash do codigo e TTL limitado |
| PASSOU | recuperacao | Validacao nao renova TTL e troca exige codigo confirmado |
| PASSOU | recuperacao | Seis redefinicoes concorrentes: autorizacao consumida exatamente uma vez |
| PASSOU | recuperacao | Senha recuperada persistida como BCrypt verificado pelo Node |
| PASSOU | recuperacao | Recuperacao invalida JWT anterior e nova senha autentica |
| PASSOU | recuperacao | Cinco erros esgotam recuperacao e codigo correto posterior e recusado |
| PASSOU | recuperacao | Expiracao absoluta e expiracao Redis recusam codigo |
| PASSOU | recuperacao | Nova solicitacao revoga a sessao/codigo anterior |
| PASSOU | recuperacao | Conta inelegivel 99: mesmo 202 e mensagem sem enumeracao |
| PASSOU | recuperacao | Conta inelegivel 3: mesmo 202 e mensagem sem enumeracao |
| PASSOU | recuperacao | Conta inelegivel 20: mesmo 202 e mensagem sem enumeracao |
| PASSOU | recuperacao | Inexistente, inativo e primeiro acesso nao enviam e-mail nem autorizam troca |
| PASSOU | qr | Cookie QR assinado resolve unidade no Redis sem Express |
| PASSOU | qr | Login QR nao renova TTL do contexto |
| PASSOU | qr | QR de outra escola nega login antes de ultimo_login_em; unidade cliente ignorada |
| PASSOU | qr | QR revogado revalidado no login; contexto e cookie removidos |
| PASSOU | qr | Contexto residual ja limpo e cookie antigo nao reautorizam QR nem bloqueiam login direto legitimo |
| PASSOU | qr | Contexto QR expirado limpa cookie e nao impoe unidade residual |
| PASSOU | qr | Cookie QR nao autentica ponto nem substitui cookie de recuperacao |
| PASSOU | ponto | Hoje antes de bater: jornada e primeira marcacao vazia |
| PASSOU | ponto | Registrar/bater 201, sequencia 1 e identidade exclusivamente do JWT |
| PASSOU | ponto | Registrar/bater 201, sequencia 2 e identidade exclusivamente do JWT |
| PASSOU | ponto | Registrar/bater 201, sequencia 3 e identidade exclusivamente do JWT |
| PASSOU | ponto | Registrar/bater 201, sequencia 4 e identidade exclusivamente do JWT |
| PASSOU | ponto | Quinta batida nega 409; hoje concluido; quatro registros/idempotencias |
| PASSOU | ponto | Historico calcula oito horas em jornada completa |
| PASSOU | ponto | Historico separa vinculos/transferencias no mesmo dia sem duplicar contagem de dias |
| PASSOU | ponto | Historico rejeita mes invalido, malformado e repetido |
| PASSOU | geo | GPS fora da escola: nega sem escrita |
| PASSOU | geo | Margem de precisao ultrapassa raio: nega sem escrita |
| PASSOU | geo | Precisao acima de 100 metros: nega sem escrita |
| PASSOU | geo | Precisao nula: nega sem escrita |
| PASSOU | geo | Leitura GPS vencida: nega sem escrita |
| PASSOU | geo | Leitura GPS futura: nega sem escrita |
| PASSOU | geo | Latitude textual: nega sem escrita |
| PASSOU | geo | Latitude fora do intervalo: nega sem escrita |
| PASSOU | geo | Timestamp fracionario: nega sem escrita |
| PASSOU | geo | Nova acao sem accuracy/timestamp negada |
| PASSOU | geo | GPS dentro da escola: distancia em metros calculada |
| PASSOU | geo | Precisao no limite de 100 metros aceita no centro |
| PASSOU | idempotencia | Replay entre registrar/bater e UUID maiusculo retorna resposta original sem nova escrita |
| PASSOU | idempotencia | Mesma chave com leitura diferente: conflito; replay nao duplica auditoria |
| PASSOU | idempotencia | Replay legado de leitura JSON [0,0] preservado |
| PASSOU | idempotencia | Chave de idempotencia e isolada por funcionario |
| PASSOU | concorrencia | Seis replays simultaneos: seis respostas 201 identicas |
| PASSOU | concorrencia | Locks reais MySQL preservam uma escrita e uma auditoria sob concorrencia |
| PASSOU | concorrencia | Seis chaves concorrentes: quatro marcacoes e dois conflitos de jornada completa |
| PASSOU | concorrencia | Sequencia e idempotencia atomicas com chaves distintas; sem 500/deadlock |
| PASSOU | rollback | Falha apos INSERT de ponto: rollback de ponto/idempotencia e nenhuma auditoria de sucesso |
| PASSOU | rollback | Mesma chave pode ser repetida apos rollback real |
| PASSOU | rollback | Falha JDBC na primeira troca preserva credencial/estado e nao audita sucesso |
| PASSOU | rollback | Recuperacao com falha JDBC nao altera senha nem audita sucesso |
| PASSOU | rollback | Autorizacao de recuperacao falhada continua consumida; exige nova solicitacao |
| PASSOU | auditoria | Evento funcionario_login_sucesso confirmado uma vez no log |
| PASSOU | auditoria | Evento funcionario_primeiro_acesso_validado confirmado uma vez no log |
| PASSOU | auditoria | Evento senha_primeiro_acesso_atualizada confirmado uma vez no log |
| PASSOU | auditoria | Evento recuperacao_senha_solicitada confirmado uma vez no log |
| PASSOU | auditoria | Evento senha_funcionario_redefinida confirmado uma vez no log |
| PASSOU | auditoria | Evento batida_ponto_realizada confirmado uma vez no log |
| PASSOU | auditoria | Tentativa invalida audita WARN; User-Agent sensivel redigido |
| PASSOU | auditoria | Logs nao expoem senhas, hashes, JWT, chave, codigo ou CPF de login/recuperacao |
| FALHOU | limites | Cinco falhas por identidade; sexta retorna 429 e cabecalhos de cota |
| PASSOU | isolamento | Sessao administrativa autentica via Gov.br/PKCE simulado com cadastro real |
| PASSOU | isolamento | Cookie administrativo nao autentica funcionario; JWT funcionario nao autentica administracao |
| PASSOU | isolamento | Login/recuperacao publicos nao substituem ou invalidam sessao Gov.br |
| PASSOU | isolamento | Logout administrativo encerra somente sessao administrativa |
| PASSOU | isolamento | JWT de funcionario permanece independente apos logout administrativo |
| PASSOU | hmac | JWT/cookies publicos e administrativos nao substituem HMAC interno |
| PASSOU | hmac | HMAC valido preserva contrato interno de ponto |
| PASSOU | hmac | Request ID repetido, timestamp antigo e corpo adulterado sao rejeitados |
| PASSOU | hmac | Credenciais internas continuam acessiveis somente por chamada HMAC valida |
| PASSOU | cleanup | mysql-dev e node-dev preservados: IDs, estado, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Containers e processos temporarios removidos |

Totais: PASSOU=97; FALHOU=1; BLOQUEADO=0.

## Rodada UTC 2026-10-18T18:59:56.087410+00:00

Grupos: limites. Requisicoes instrumentadas: 227.

| Resultado | Grupo | Cenario |
|---|---|---|
| PASSOU | infra | Java 21, Spring real e JDBC/MySQL 8.4/Redis 7/SMTP/Gov.br isolados; sem Express |
| PASSOU | limites | Cinco falhas por identidade; sexta retorna 429 e cabecalhos de cota |
| PASSOU | limites | Logins bem-sucedidos descontam reservas na chave HMAC compativel com Node |
| PASSOU | limites | Limite agregado de falhas por IP bloqueia tentativa correta apos dez falhas |
| PASSOU | limites | Cota por ID autenticado limita replay e libera apos janela; sem duplicacao |
| PASSOU | limites | Recuperacao limitada por CPF normalizado a cinco solicitacoes |
| PASSOU | limites | Cota sensivel limita primeira troca sem sessao a 40 tentativas |
| PASSOU | limites | Teto de abuso IP protege inclusive autenticacao ausente |
| PASSOU | limites | Redis indisponivel: falha fechada 503, sem fallback ou JWT |
| PASSOU | limites | Redis recuperado: protecao retoma com armazenamento compartilhado |
| PASSOU | cleanup | mysql-dev e node-dev preservados: IDs, estado, inicio e reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Containers e processos temporarios removidos |

Totais: PASSOU=13; FALHOU=0; BLOQUEADO=0.
