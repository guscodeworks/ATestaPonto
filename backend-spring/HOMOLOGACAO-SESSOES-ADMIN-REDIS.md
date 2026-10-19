# Homologacao — sessoes administrativas Spring Redis

Java 21, JAR real, duas instancias Spring, MySQL 8.4/Redis 7 descartaveis em tmpfs
e Gov.br Python simulado com validacao de PKCE. Sem Express, .env ou banco real.

Reproduzir: `./mvnw -o -DskipTests package && python3 scripts/check-admin-redis-sessions.py`.
Repetir somente grupos afetados: `python3 scripts/check-admin-redis-sessions.py --only csrf,outage`.
Requer Docker, imagens locais `mysql:8.4` e `redis:7-alpine`, Node e o bcrypt ja
instalado no gateway (somente para gerar a credencial ficticia da fixture).
Sem commit, merge, push ou deploy.

## Resultado consolidado

**PASSOU: 82 verificacoes na rodada completa. FALHOU: 0. BLOQUEADO: 0 pendentes.**

Build aprovado com OpenJDK 21.0.12.1 e Spring Boot 3.5.16:
`./mvnw -o -B -DskipTests package`. A verificacao HTTP executa o JAR real, sem
substituir services/repositories da aplicacao. As identidades e credenciais sao
ficticias; apenas o provedor Gov.br e simulado. O ambiente usa `NODE_ENV=production`
com Redis habilitado. HTTP em localhost usa opt-in `ADMIN_SESSION_SECURE=false`;
uma instancia adicional confere a emissao de cookie Secure com configuracao HTTPS.

| Escopo | Resultado |
|---|---|
| OAuth/PKCE da A para B, state adulterado/duplicado, token injetado e replay do callback | PASSOU |
| Rotacao, recusa de ID imposto e de ID pre-login | PASSOU |
| Sessao e CSRF apos reiniciar A e B; OAuth pendente apos reinicio da origem | PASSOU |
| Logout na B invalida o mesmo ID em A/B, inclusive apos reinicio | PASSOU |
| Revogacao pela API com SQL real no MySQL temporario; desativacao da identidade | PASSOU |
| Invalidacao na proxima requisicao e recusa dos IDs mesmo apos restaurar a fixture | PASSOU |
| CSRF valido entre instancias, adulterado/ausente/cruzado e excecao por origem confiavel | PASSOU |
| JWT valido de funcionario e cookies assinados Express/QR/recuperacao isolados | PASSOU |
| Expiracao absoluta sob atividade, TTL ocioso e replay manual de cookie expirado | PASSOU |
| HMAC valido, corpo adulterado, timestamp expirado e replay por instancia | PASSOU |
| Redis pausado: sessao/login/callback falham fechado; HMAC interno segue funcional | PASSOU |
| Recuperacao Redis e perda das chaves: nenhum fallback administrativo em memoria | PASSOU |
| Logs sem secrets/identificadores pessoais; recursos temporarios removidos | PASSOU |
| mysql-dev/node-dev com mesmos IDs/estado/inicio/reinicios; .env com mesmos hashes | PASSOU |

O bloqueio inicial ocorreu na preparacao: uma origem CORS HTTP e recusada pelo
modo production. A fixture passou a usar origem HTTPS; o diagnostico de startup
foi reduzido as causas relevantes. A credencial da fixture tambem passou a usar
BCrypt valido. Nenhum grupo funcional havia executado antes dessa correcao;
todos os grupos foram executados uma vez na rodada completa. Nenhuma correcao
adicional no codigo de producao foi necessaria. O historico abaixo foi preservado.

Limites: nao exercita Gov.br real, trafego TLS real, carga, Redis Cluster ou
deploy com versoes diferentes. A revogacao e detectada ao revalidar cada sessao
na proxima requisicao, sem cancelamento de requisicoes ja autorizadas. Logout
global neste roteiro significa invalidar o mesmo ID em todas as instancias.

## Rodada UTC 2026-10-19T00:18:36.700488+00:00

Grupos: todos.

| Resultado | Grupo | Cenario |
|---|---|---|
| BLOQUEADO | infra | RuntimeError: Spring encerrou: 19.jar!/:6.2.19] 	at org.springframework.context.support.AbstractApplicationContext.finishBeanFactoryInitialization(AbstractApplicationContext.java:991) ~[spring-context-6.2.19.jar!/:6.2.19] 	at org.springframework.context.support.AbstractApplicationContext.refresh(AbstractApplicationContext.java:628) ~[spring-context-6.2.19.jar!/:6.2.19] 	at org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext.refresh(ServletWebServerApplicationContext.java:146) ~[spring-boot-3.5.16.jar!/:3.5.16] 	at org.springframework.boot.SpringApplication.refresh(SpringApplication.java:752) ~[spring-boot-3.5.16.jar!/:3.5.16] 	at org.springframework.boot.SpringApplication.refreshContext(SpringApplication.java:439) ~[spring-boot-3.5.16.jar!/:3.5.16] 	at org.springframework.boot.SpringApplication.run(SpringApplication.java:318) ~[spring-boot-3.5.16.jar!/:3.5.16] 	at org.springframework.boot.SpringApplication.run(SpringApplication.java:1361) ~[spring-boot-3.5.16.jar!/:3.5.16] 	at org.springframework.boot.SpringApplication.run(SpringApplication.java:1350) ~[spring-boot-3.5.16.jar!/:3.5.16] 	at br.com.atestaponto.EscolaServiceApplication.main(EscolaServiceApplication.java:10) ~[!/:0.0.1-SNAPSHOT] 	at java.base/jdk.internal.reflect.DirectMethodHandleAccessor.invoke(DirectMethodHandleAccessor.java:103) ~[na:na] 	at java.base/java.lang.reflect.Method.invoke(Method.java:580) ~[na:na] 	at org.springframework.boot.loader.launch.Launcher.launch(Launcher.java:1 |
| PASSOU | cleanup | mysql-dev e node-dev preservados: ID, estado, inicio e contador de reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Somente containers/processos temporarios encerrados; Gov.br local finalizado |

Totais: PASSOU=3; FALHOU=0; BLOQUEADO=1.

## Rodada UTC 2026-10-19T00:22:03.958406+00:00

Grupos: todos.

| Resultado | Grupo | Cenario |
|---|---|---|
| PASSOU | infra | Java 21/JAR real; duas instancias; MySQL 8.4 e Redis 7 tmpfs; Gov.br simulado |
| PASSOU | oauth | OAuth pendente persistido no Redis antes do callback |
| PASSOU | oauth | OAuth/PKCE inicia A, termina B; autenticacao nas duas instancias |
| PASSOU | oauth | Rotacao elimina ID pre-login e impede session fixation |
| PASSOU | oauth | Nome, caminho, HttpOnly, SameSite e TTL do cookie preservados |
| PASSOU | oauth | Callback grava ultimo login somente no MySQL temporario |
| PASSOU | oauth | ID inexistente escolhido pelo navegador nao e aceito |
| PASSOU | oauth | ID imposto e ID pre-login nao autorizam apos login |
| PASSOU | oauth | State adulterado rejeitado e estado consumido entre instancias |
| PASSOU | oauth | State duplicado rejeitado |
| PASSOU | oauth | Token injetado na URL rejeitado |
| PASSOU | oauth | Gov.br simulado confere e rejeita PKCE incorreto |
| PASSOU | oauth | Falha no provedor nao cria sessao administrativa |
| PASSOU | oauth | Callback nao pode ser reutilizado em outra instancia |
| PASSOU | restart | Sessao autenticada preservada apos reiniciar instancia 0 |
| PASSOU | restart | Sessao autenticada preservada apos reiniciar instancia 1 |
| PASSOU | restart | CSRF persistido sobrevive ao reinicio das duas instancias |
| PASSOU | restart | OAuth pendente sobrevive ao reinicio da instancia de origem |
| PASSOU | logout | Logout sem origem confiavel rejeitado |
| PASSOU | logout | Logout sem origem confiavel rejeitado |
| PASSOU | logout | Logout rejeitado preserva a sessao |
| PASSOU | logout | Logout na B expira cookie administrativo |
| PASSOU | logout | Logout global: chave excluida e ID recusado em A/B |
| PASSOU | logout | Logout permanece invalido apos reinicio |
| PASSOU | revocation | Acesso JDBC inicialmente ativo nas duas instancias |
| PASSOU | revocation | Revogacao confirmada pela API publica e MySQL isolado |
| PASSOU | revocation | Revogacao detectada em auth/me na B exclui sessao Redis |
| PASSOU | revocation | Sessao revogada na B nao e aceita na A |
| PASSOU | revocation | Outra sessao do mesmo usuario tambem e invalidada ao revalidar |
| PASSOU | revocation | Novo login negado apos revogacao |
| PASSOU | revocation | Restaurar fixture de acesso nao ressuscita IDs invalidados |
| PASSOU | revocation | Desativar identidade tambem invalida sessao distribuida |
| PASSOU | csrf | POST administrativo sem CSRF rejeitado na outra instancia |
| PASSOU | csrf | CSRF adulterado rejeitado |
| PASSOU | csrf | CSRF valido carregado do Redis e aceito na B |
| PASSOU | csrf | CSRF nao pode ser transferido para outra sessao |
| PASSOU | csrf | API sem CSRF rejeita origem ausente ou externa |
| PASSOU | csrf | API sem CSRF rejeita origem ausente ou externa |
| PASSOU | csrf | API sem CSRF rejeita origem ausente ou externa |
| PASSOU | csrf | Excecao CSRF existente aceita somente origem configurada |
| PASSOU | isolation | JWT de funcionario ficticio e valido no fluxo de ponto real |
| PASSOU | isolation | JWT valido de funcionario nao autentica administrador |
| PASSOU | isolation | Cookie assinado ponto_qr_acesso nao concede acesso administrativo |
| PASSOU | isolation | Cookie ponto_qr_acesso renomeado para administrativo tambem e recusado |
| PASSOU | isolation | Cookie assinado ponto_recovery nao concede acesso administrativo |
| PASSOU | isolation | Cookie ponto_recovery renomeado para administrativo tambem e recusado |
| PASSOU | isolation | Cookie assinado connect.sid nao concede acesso administrativo |
| PASSOU | isolation | Cookie connect.sid renomeado para administrativo tambem e recusado |
| PASSOU | isolation | Cookies coexistem sem mascarar sessao administrativa |
| PASSOU | isolation | Cookie administrativo nao autentica funcionario |
| PASSOU | isolation | JWT de funcionario funciona com todos os cookies coexistindo |
| PASSOU | isolation | Logout administrativo preserva chaves Express/QR/recuperacao |
| PASSOU | isolation | Namespace e tipos Redis administrativos isolados das sessoes Express JSON |
| PASSOU | hmac | Cookie admin nao substitui HMAC na instancia 0 |
| PASSOU | hmac | HMAC valido consulta contexto JDBC na instancia 0 |
| PASSOU | hmac | Replay HMAC rejeitado na instancia 0 |
| PASSOU | hmac | Corpo HMAC adulterado rejeitado na instancia 0 |
| PASSOU | hmac | Timestamp HMAC expirado rejeitado na instancia 0 |
| PASSOU | hmac | Cookie admin nao substitui HMAC na instancia 1 |
| PASSOU | hmac | HMAC valido consulta contexto JDBC na instancia 1 |
| PASSOU | hmac | Replay HMAC rejeitado na instancia 1 |
| PASSOU | hmac | Corpo HMAC adulterado rejeitado na instancia 1 |
| PASSOU | hmac | Timestamp HMAC expirado rejeitado na instancia 1 |
| PASSOU | expiry | TTL curto realmente aplicado a chave Redis |
| PASSOU | expiry | Expiracao absoluta vence mesmo com atividade continua em outra instancia |
| PASSOU | expiry | Expiracao ociosa elimina chave e rejeita replay manual do cookie |
| PASSOU | expiry | Configuracao HTTPS preserva cookie Secure/HttpOnly/SameSite |
| PASSOU | outage | Redis indisponivel recusa sessao autenticada na instancia 0 |
| PASSOU | outage | Redis indisponivel impede login sem JSESSIONID alternativo na instancia 0 |
| PASSOU | outage | Redis indisponivel recusa sessao autenticada na instancia 1 |
| PASSOU | outage | Redis indisponivel impede login sem JSESSIONID alternativo na instancia 1 |
| PASSOU | outage | Callback pendente tambem falha fechado durante indisponibilidade |
| PASSOU | outage | HMAC interno continua operante com cookie admin e Redis de sessao indisponivel |
| PASSOU | outage | Cookie invalido nao cria sessao alternativa durante indisponibilidade |
| PASSOU | outage | Recuperacao Redis restaura apenas sessao persistida existente |
| PASSOU | outage | Perda das chaves Redis nao ressuscita sessao em memoria de A/B |
| PASSOU | outage | Novo login funciona apos recuperacao sem reutilizar estado antigo |
| PASSOU | audit | Logs sem chaves, cookies de sessao ou tokens OAuth |
| PASSOU | audit | Logs sem CPF/email das fixtures |
| PASSOU | cleanup | mysql-dev e node-dev preservados: ID, estado, inicio e contador de reinicios |
| PASSOU | cleanup | .env preservados byte a byte |
| PASSOU | cleanup | Somente containers/processos temporarios encerrados; Gov.br local finalizado |

Totais: PASSOU=82; FALHOU=0; BLOQUEADO=0.
