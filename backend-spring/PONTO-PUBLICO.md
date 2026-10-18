# Autenticação e ponto públicos no Spring

Implementação das URLs existentes, sem alterar páginas, assets, Express ou `/internal/**`:

| Método | URL | Resposta de sucesso |
| --- | --- | --- |
| POST | `/api/pontos/login` | 200, JWT normal ou comprovante de primeiro acesso |
| POST | `/api/pontos/registrar`, `/api/pontos/bater` | 201, ponto e funcionário |
| GET | `/api/pontos/hoje` | 200, jornada, marcações e próxima batida |
| GET | `/api/pontos/historico?mes=YYYY-MM` | 200, período, resumo e registros |
| POST | `/api/pontos/primeiro-acesso/trocar-senha` | 200, troca obrigatória concluída |
| POST | `/api/pontos/recuperar-senha/solicitar` | 202, mensagem genérica |
| POST | `/api/pontos/recuperar-senha/validar` | 200, código confirmado |
| POST | `/api/pontos/recuperar-senha/redefinir` | 200, senha atualizada |

Aceita barra final, JSON e formulários URL-encoded conforme o gateway; campos GPS
continuam exigindo números JSON. Limite do corpo: 100 KiB. Respostas mantêm
`{success,data}` e `{success:false,error:{code,message,details}}`, sem hashes,
identificadores de recuperação, códigos ou a flag interna `replayed`.

O login recebe `identificador` e `senha`; `login`, `email` e `cpf` continuam
aceitos como aliases do identificador. Registro recebe `chaveIdempotencia`
(UUID v4), `latitude`, `longitude`, `accuracy` e `timestamp` GPS em milissegundos.
Registro, hoje e histórico exigem `Authorization: Bearer <JWT de funcionário>`.

A primeira troca recebe `novaSenha` e o comprovante no mesmo cabeçalho Bearer.
Recuperação recebe, respectivamente, `cpf`, `codigo` e `novaSenha`, conservando
o cookie `ponto_recovery` entre as três etapas. Nenhuma unidade ou identidade
fornecida no corpo concede autorização.

Erros mantêm 400 para requisição/GPS inválido, 401 para credencial, JWT ou código
inválido/expirado, 403 para QR incompatível/revogado ou troca obrigatória,
409 para conflito/repetição da primeira troca, 422 para validações públicas,
429 para cotas e 503 para armazenamento de cotas indisponível. Falha do serviço
de credenciais mantém 502. Métodos indevidos em login/registrar/bater retornam
405 com `Allow: POST`. Registro e replay bem-sucedidos retornam 201.

## Domínio e autenticação

`EmployeeCredentialsService`, `PunchService` e `SchoolQrService` são chamados
diretamente. Seus endpoints internos, JDBC, locks, transações e schema continuam
inalterados. A identidade vem exclusivamente do JWT verificado e do cadastro
revalidado; IDs e unidade escolar no corpo não autorizam operações.

JWTs HS256 emitidos são compatíveis com o Node, inclusive `sub`, `role`, `iat`,
`exp`, `credentialVersion` e `expiresIn`. A validação normal também aceita os
algoritmos HMAC HS384/HS512 anteriormente aceitos pelo jsonwebtoken. O comprovante
`primeira_troca_senha` exige HS256 e a mesma chave derivada SHA-256 do gateway;
não autentica o ponto. Alterar a senha invalida o JWT normal pela versão HMAC da
credencial persistida. Funcionário inativo, primeiro acesso pendente, vínculo
ativo ausente ou falha de consulta negam acesso conforme a etapa do fluxo.

BCrypt mantém os rounds configurados, formato `$2b$` e truncamento Node de
72 bytes UTF-8, inclusive quando corta um caractere. O replay usa a mesma ordem
e representação numérica ECMAScript da leitura GPS; sequência, geofence, idade
da leitura, idempotência e conflitos permanecem no `PunchService`. Auditoria
mantém os eventos, funcionário, IP e metadados de domínio; login é redigido,
CPF público é mascarado e User-Agent é truncado/sanitizado. Replay não repete
o evento de registro.

## QR e recuperação

A página `/ponto/acessar` continua no Express e estabelece o cookie assinado
`ponto_qr_acesso`. Spring verifica sua assinatura com `SESSION_SECRET` e lê a
mesma sessão em `<namespace>:ponto:session:<sha256(sid)>`, sem carregar a sessão
administrativa. O token vem de `funcionario_qr.token` no servidor e é novamente
resolvido pelo `SchoolQrService` no login: índice reverso, token atual e revogação
no Redis são conferidos antes de comparar a unidade com o vínculo ativo.
QR revogado retorna 403 e apaga o contexto. Contextos expirados não autorizam
uma unidade. O TTL de 15 minutos não é renovado pela leitura no login.
A integração com a página Express exige Redis compartilhado; sessões em memória
Express não são transportadas para o Spring.

Recuperação usa `ponto_recovery`, HttpOnly, SameSite=Lax, Path=/ e Secure em
produção, independente da sessão administrativa e do cookie QR. Assinatura e
serialização Redis são compatíveis com o gateway. A solicitação substitui a
sessão anterior; conta inexistente recebe a mesma mensagem, cookie e ciclo de
tentativas, sem autorização de troca. O código aleatório de seis dígitos só é
persistido como hash ligado a `SESSION_SECRET`, vence em 15 minutos e admite
cinco tentativas. CAS Redis conserva o TTL, serializa tentativas e consome a
autorização uma única vez antes de atualizar a senha. Falha posterior exige
nova recuperação. A resposta leva pelo menos 300 ms; SMTP e auditoria da
solicitação são agendados após sua conclusão, sem incluir o código na resposta.
Desenvolvimento sem Redis admite somente recuperação e cotas locais limitadas;
produção e Redis habilitado não fazem fallback em caso de falha.

## Configuração e transição

Use os mesmos `JWT_SECRET`, `SESSION_SECRET`, `REDIS_NAMESPACE`, Redis/banco 0,
`NODE_ENV`, rounds e expirações do gateway. As duas chaves são obrigatórias,
distintas e de pelo menos 32 caracteres. `CORS_ORIGIN` conserva a allowlist do
Express; ausência não libera origens e `*` é proibido em produção. SMTP reutiliza
as variáveis e o remetente já usados por `EmployeeWelcomeEmail`.
Veja os nomes e padrões em [.env.example](.env.example); valores reais não são
versionados. Maven não carrega `.env` automaticamente.

Cotas compartilham nomes, chaves HMAC, contadores Redis e cabeçalhos com Express:
`ip-abuse`, `login-ip-failure`, `login-identity`, `password-recovery`, `sensitive`,
`sensitive-resource` e `point`. Login bem-sucedido desconta a reserva por
identidade sem afetar outra geração da janela. Ponto usa ID autenticado e sua
janela configurada; falha de armazenamento de cotas retorna 503 e excesso 429.
Sem sessão válida de recuperação, a cota sensível usa IP, evitando identidades
arbitrárias. O IP das cotas segue `trust proxy=1` (último salto X-Forwarded-For);
a entrada deve manter a mesma fronteira de proxy confiável.

Não houve alteração de roteamento, deploy ou infraestrutura. Para ativar a
migração, encaminhe o prefixo completo `/api/pontos/**` ao Spring mantendo a
mesma origem pública/cookies, páginas e assets no Express. Preserve a entrada
privada HMAC de `/internal/**`; não publique a porta inteira do Spring. Os aliases
legados `/ponto/**` do Express continuam presentes. Não habilite logs de corpos,
Authorization, Cookie, Set-Cookie ou query do QR.

## Validação isolada inicial

Nesta primeira etapa, os harnesses eram temporários em `/tmp`, sem novos testes no repo,
sem `.env`, MySQL ou dados reais. Usam os serviços públicos reais, credenciais e
ponto simulados, bibliotecas Node instaladas e Redis 7 temporário isolado.
O harness HTTP usa Spring MVC/Security e Tomcat próprios, com o filtro HMAC
original; não inicia a aplicação configurada nem conecta ao banco.

Resultados em 18/10/2026:

- `./mvnw -o compile`: passou com Java 21, sem iniciar a aplicação configurada.
- 2.049 assertions isoladas passaram, incluindo 1.989 representações numéricas
  confrontadas com `JSON.stringify` do Node, JWT normal/primeiro acesso,
  BCrypt Unicode, versão de credencial, validações, QR compartilhado/revogado,
  TTL sem renovação, recuperação inexistente, cinco tentativas, consumo único
  concorrente, cotas Redis, desconto por geração e falha fechada.
- 35 verificações HTTP passaram: nove rotas, sucesso/erros, aliases, barras
  finais, corpo limitado, JSON/formulário, CORS, projeções públicas, recuperação
  completa, primeiro acesso completo e invalidação do JWT após troca da senha.
- O filtro HMAC original passou no harness HTTP: cookie/JWT público sem
  assinatura é rejeitado; requisição assinada passa e replay é rejeitado.
- O Node validou os JWTs e hashes BCrypt produzidos pelo Spring, incluindo a
  versão HMAC da credencial. Os segredos usados eram exclusivamente sintéticos.
- `git diff --check` passou; whitespace dos novos arquivos também foi verificado.

Na validação isolada inicial não foram executados MySQL, escrita em dados reais,
SMTP real, startup da aplicação configurada, homologação completa do JDBC ou
regressão administrativa completa. Os containers Redis e servidores temporários foram removidos. Sem
commit, push, alteração das páginas/assets, infraestrutura ou dependências.

## Arquivos da alteração

Sob `src/main/java/br/com/atestaponto/`:

- `publicpunch/config/PublicPunchSecurity.java`
- `publicpunch/controller/PublicPunchController.java`
- `publicpunch/controller/PublicPunchErrors.java`
- `publicpunch/service/EmployeeAccessSessions.java`
- `publicpunch/service/EmployeeJwt.java`
- `publicpunch/service/PublicPasswordRecovery.java`
- `publicpunch/service/PublicPunchException.java`
- `publicpunch/service/PublicPunchRateLimit.java`
- `publicpunch/service/PublicPunchService.java`
- `publicpunch/service/PublicPunchValidation.java`
- `auth/admin/service/PublicAdminRateLimit.java`
- `employee/service/EmployeeWelcomeEmail.java`

Também: `.env.example` e este `PONTO-PUBLICO.md`.


## Homologação posterior com Spring/JDBC reais

**PASSOU**: os 14 grupos de autenticação, primeiro acesso, recuperação SMTP,
QR/contexto residual, ponto/consultas, geolocalização, idempotência, concorrência,
rollback, auditoria, cotas, isolamento administrativo e HMAC. Foram usados Java
21, MySQL/Redis temporários, SMTP/Gov.br locais e dados fictícios, sem Express.

O startup real encontrou e permitiu corrigir a colisão de nome entre o bean de
configuração e a cadeia de segurança; o método agora é `publicPunchSecurityChain`.
Após os demais grupos passarem, somente o grupo de limites foi repetido para
corrigir uma asserção do harness sobre cabeçalhos repetidos. Nenhuma pendência
funcional ou bloqueio permaneceu.

Consulte [HOMOLOGACAO-PONTO-PUBLICO.md](HOMOLOGACAO-PONTO-PUBLICO.md) para resultados,
falhas resolvidas, configuração da fixture e reprodução com
`scripts/check-public-punch.py --only ...`. `mysql-dev`, `node-dev` e `.env` foram
preservados em todas as rodadas; os recursos temporários foram removidos.
Sem commit, merge ou deploy. Provedores reais e carga prolongada não foram testados.


## Revisão final para PR

- Diff restrito a 16 arquivos em `backend-spring/`: dez classes públicas novas,
  extensão do contador compartilhado, envio de e-mail de recuperação,
  `.env.example`, harness e dois documentos. A lista das dez classes e dos
  serviços existentes consta na seção de arquivos; harness e relatório são os links acima.
- `origin/develop` atualizada e sem divergência da base da branch; nenhum arquivo
  em conflito ou marcador de merge.
- `./mvnw -o -DskipTests package` aprovado novamente com Java 21 na finalização.
  Sintaxe do harness, whitespace, escopo e padrões conhecidos de credenciais
  foram conferidos. Os testes gerais e a homologação não foram repetidos.
- Revisão de contratos, assinatura/expiração/versão do JWT, isolamento de cookies,
  contexto QR no Redis, recuperação atômica, identidade do ponto e HMAC interno
  sem falha crítica ou bloqueio pendente.
- Express, páginas/assets do Guilherme, ATestaID, schema, dependências e código
  de `/internal/**` permanecem inalterados. Roteamento e deploy não fazem parte
  desta PR; ativação futura mantém a origem pública e o Redis compartilhado.

Arquivos adicionais à lista de classes: `scripts/check-public-punch.py` e
`HOMOLOGACAO-PONTO-PUBLICO.md`. As referências anteriores a ausência de commit
ou publicação descrevem as rodadas de validação, anteriores à finalização.
