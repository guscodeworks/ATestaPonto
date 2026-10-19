# Homologacao das paginas Spring

Execucao UTC: 2026-10-19T00:51:52.221494+00:00
Branch: feat/spring-protected-pages
JAR SHA-256: 64343b5bc7d6d1f4b6693b537a85c9ad939150df9b8894c07a1ce21de5eacf0f

Compilacao: Java 21; ./mvnw -o -DskipTests package. Sem testes JUnit; validacoes HTTP abaixo.
JAR completo, repositories/JDBC reais, MySQL 8.4 e Redis 7 descartaveis; Gov.br simulado local com PKCE.
Nenhum banco de desenvolvimento/producao acessado; sem Express, commit, merge ou deploy.

Requisicoes HTTP verificadas: 271. PASSOU: 37, FALHOU: 0, BLOQUEADO: 51.
PASSOU significa apenas o cenario descrito. BLOQUEADO nao conta como aprovacao do frontend/fluxo visual.

Rodada inicial: 29 PASSOU, 3 FALHOU e 51 BLOQUEADO. As tres falhas eram do roteiro/fixture:
URLs privadas fora de /admin podem redirecionar para login sem carregar o cookie administrativo;
o filtro legitimo de diretoria reduz a listagem dentro do escopo; a fixture de vigencia precisava
de data_inicio anterior a data_fim. O roteiro foi corrigido e toda a rodada repetida.
Nenhum codigo da aplicacao foi alterado durante esta homologacao.

## Contrato das rotas administrativas

As rotas abaixo aceitam barra final. Todo HTML exige sessao administrativa Redis valida,
administrativo ativo e acessos ativos/vigentes revalidados pelo Spring antes da entrega.

| GET | HTML privado ou redirecionamento | Capacidade adicional |
| --- | --- | --- |
| /admin e /admin/index | 302 para /admin/dashboard | Sessao administrativa autorizada |
| /admin/dashboard | admin-pages/dashboard.html | Sessao administrativa autorizada |
| /admin/diretorias | admin-pages/departments.html | diretoria.gerenciar |
| /admin/escolas | admin-pages/schools.html | escola.listar |
| /admin/escolas/nova | admin-pages/register-school.html | escola.criar |
| /admin/funcionario e /admin/funcionarios | admin-pages/employees.html | funcionario.listar |
| /admin/funcionarios/novo | admin-pages/register-employee.html | funcionario.criar |
| /admin/registrar-funcionario | 302 para /admin/funcionarios/novo | funcionario.criar |
| /admin/pontos e /admin/pontos-do-dia | admin-pages/daily-points.html | ponto.hoje.visualizar |
| /admin/relatorios | admin-pages/reports.html | relatorio.hierarquico.visualizar |
| /admin/configuracoes | admin-pages/settings.html | Sessao administrativa autorizada |

O GET /admin/login existente permanece com 302 para /auth/govbr/login.
Sessao ausente/expirada ou cadastro/acessos invalidados redirecionam ao login;
capacidade ou escopo insuficientes negam a pagina com 403, antes do HTML.
O acesso que oferece a capacidade tambem define o territorio; acesso global exige
autorizacao SEDUC explicita. Colecoes com escopo escolar vazio sao negadas.
Criar a primeira escola continua permitido para uma DRE autorizada sem escolas.
Nenhum HTML administrativo fica em static/ ou usa caminho fornecido pelo navegador.
As respostas HTML preservam os bytes originais, text/html;charset=UTF-8 e no-store.

## Contrato da navegacao inicial e QR

| GET | Comportamento |
| --- | --- |
| / e /login | Limpa contexto/cookie QR residual e entrega employee-pages/index.html |
| /home | 302 relativo para / |
| /ponto e /bater-ponto | 302 relativo para /ponto/acessar, sem propagar query string |
| /ponto/acessar sem qr | Limpa contexto anterior e entrega o mesmo index.html |
| /ponto/acessar?qr=TOKEN | Resolve o token atual no Redis antes do HTML e cria contexto QR temporario |

As rotas nomeadas tambem aceitam barra final. O index.html e uma copia privada,
identica ao original; estas rotas publicas usam cadeia stateless separada do admin.
O contexto contem somente o token, em sessao compativel com a serializacao Express;
o cookie separado ponto_qr_acesso recebe assinatura HMAC com SESSION_SECRET,
HttpOnly, SameSite=Lax e TTL absoluto de 900 segundos. Secure segue NODE_ENV=production.
O Redis conserva o mesmo TTL e namespace existentes, sem renovacao no POST de login.
Referrer-Policy: no-referrer evita propagar a URL do QR para os assets.

QR invalido, vazio, duplicado ou revogado responde 403. O POST /api/pontos/login
continua resolvendo o token e consultando o vinculo escolar persistido; a unidade
enviada pelo navegador nunca autoriza. QR revogado ou escola divergente nega o login.
Contexto expirado e descartado, permitindo o fluxo normal com credenciais.
O cookie QR nao autentica funcionario/admin e nao substitui JWT, cookie administrativo
ou cookie de recuperacao. Sessao administrativa e HMAC/anti-replay internos permanecem
nos fluxos existentes. A aplicacao Express e seus contratos nao foram removidos.

## Escopo dos testes e dependencias

A tabela de evidencias registra o JAR completo em HTTP direto, sem mocks de services,
repositories ou JDBC. Apenas o provedor Gov.br e simulado; os dados sao ficticios.
Foram verificados seis perfis, escopo misto/global/DRE/unidade/vazio, alteracao de
territorio, revogacao, expiracao Redis/absoluta, cabecalhos, aliases e isolamento.
No fechamento, o build Java 21 manteve o mesmo SHA-256 do JAR homologado;
os testes HTTP gerais nao foram repetidos e os arquivos originais nao foram alterados.

Para reproduzir: empacotar o backend com Java 21 e executar
python3 backend-spring/scripts/check-protected-pages.py na raiz, com Java 21 no PATH.
O roteiro requer Docker, imagens locais mysql:8.4/redis:7-alpine e bcrypt ja instalado
no gateway. Ele nao carrega .env, cria somente recursos descartaveis e os remove ao final.

As 51 ocorrencias BLOQUEADO abaixo representam 45 assets, cinco paginas pendentes
do Guilherme e a homologacao visual completa. A disponibilidade/roteamento de CSS,
JS, fontes e imagens, as paginas /funcionario, /funcionario/perfil,
/funcionario/relatorio, /recuperar-senha e /first-access permanecem dependencias.
O frontend completo deve ser homologado apos essas entregas. Nenhum teste bloqueado
foi contabilizado como aprovado; nenhum arquivo do Guilherme ou do Express foi modificado.

## Evidencias da rodada final

| Estado | Grupo | Evidencia |
| --- | --- | --- |
| PASSOU | infra | Java 21 e JAR empacotado disponiveis |
| PASSOU | infra | JAR Spring real com JDBC/MySQL 8.4, Redis 7 e Gov.br/PKCE local; Express nao iniciado |
| PASSOU | infra | Gov.br simulado: oito logins reais Authorization Code/PKCE, sessao Redis e rotacao de ID |
| PASSOU | paginas-administrativas | Perfil fixture 1: 18 HTMLs autorizados identicos/UTF-8/no-store; 4 negados sem HTML |
| PASSOU | paginas-administrativas | Perfil fixture 2: 10 HTMLs autorizados identicos/UTF-8/no-store; 12 negados sem HTML |
| PASSOU | paginas-administrativas | Perfil fixture 3: 18 HTMLs autorizados identicos/UTF-8/no-store; 4 negados sem HTML |
| PASSOU | paginas-administrativas | Perfil fixture 4: 18 HTMLs autorizados identicos/UTF-8/no-store; 4 negados sem HTML |
| PASSOU | paginas-administrativas | Perfil fixture 5: 18 HTMLs autorizados identicos/UTF-8/no-store; 4 negados sem HTML |
| PASSOU | paginas-administrativas | Perfil fixture 6: 16 HTMLs autorizados identicos/UTF-8/no-store; 6 negados sem HTML |
| PASSOU | paginas-administrativas | Todas as paginas administrativas negam navegador sem sessao antes do HTML |
| PASSOU | paginas-administrativas | Aliases singular/plural, pontos e redirects index/cadastro/login preservados e protegidos |
| PASSOU | paginas-administrativas | HEAD protegido e URLs diretas/travessia nao entregam recursos privados |
| PASSOU | territorio-capacidades | Territorio JDBC: unidade propria, DRE A/B e global explicito; IDs do navegador nao ampliam escopo |
| PASSOU | territorio-capacidades | Capacidade no mesmo acesso: SEDUC+diretor nao transforma listagem de funcionarios em global |
| PASSOU | territorio-capacidades | DRE sem escolas: paginas de colecoes negadas; cadastro da primeira escola autorizado pela DRE |
| PASSOU | territorio-capacidades | Mudanca territorial persistida revalidada na sessao existente, sem escopo antigo |
| PASSOU | sessoes | Inativo, acesso revogado e vigencia vencida negam HTML/login e invalidam sessao no Redis |
| PASSOU | sessoes | Sessao expirada no Redis negada antes do HTML |
| PASSOU | sessoes | Expiracao absoluta ADMIN_EXPIRES_AT tambem negada com chave Redis ainda vigente |
| PASSOU | navegacao-qr | Acesso normal sem QR: HTML original/UTF-8/no-store e redirects relativos; unidade enviada nao autoriza |
| PASSOU | navegacao-qr | Geracao QR pelo HMAC real: assinatura exigida e replay rejeitado |
| PASSOU | navegacao-qr | GET QR valida Redis e cria somente token em contexto assinado; cookie separado HttpOnly/SameSite; TTL absoluto 15 minutos |
| PASSOU | navegacao-qr | POST QR revalida vinculo real, ignora unidade do navegador, nao renova TTL e nega escola divergente antes de gravar ultimo login |
| PASSOU | navegacao-qr | Vinculo alterado entre GET e POST e reconsultado e negado no login |
| PASSOU | navegacao-qr | QR revogado apos abrir pagina nega POST; invalido/vazio/duplicado/revogado nega GET sem HTML |
| PASSOU | navegacao-qr | Inicio/login/acesso sem QR removem contexto residual no Redis e cookie; login normal deixa de impor escola anterior |
| PASSOU | navegacao-qr | TTL expirado limpa cookie e retorna ao login normal, sem autorizacao escolar residual |
| PASSOU | navegacao-qr | Unidade/QR somente no corpo do login nao criam contexto autorizado |
| PASSOU | isolamento-cookies | GET QR, login de funcionario e limpeza QR preservam sessao/cookie administrativo existente |
| PASSOU | isolamento-cookies | Cookie QR sozinho nao autentica admin nem consulta ponto; cookies nao se substituem |
| PASSOU | isolamento-cookies | Sessao admin nao autentica funcionario; JWT de funcionario nao autentica admin |
| PASSOU | isolamento-cookies | Logout administrativo invalida admin e preserva contexto QR independente |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /assets/css/admin/departments.css; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /assets/css/admin/register-school.css; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /assets/css/admin/schools.css; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /assets/css/bundles/admin.css; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /assets/css/bundles/login.css; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /assets/js/admin/admin.js; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /assets/js/auth/login.js; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/arrow-up-right.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/badge.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/calendar-days.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/chart-column.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/check.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/circle-check.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/circle-x.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/circle.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/clipboard-list.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/clock.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/eye.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/file-text.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/info.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/key-round.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/layout-dashboard.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/lock.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/log-out.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/mail.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/menu.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/printer.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/save.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/school.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/search.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/settings.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/shield.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/smartphone.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/timer.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/trending-up.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/triangle-alert.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/user-plus.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/user.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/users.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /icons/x.svg; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /img/atestaponto-symbol.png; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /img/background-desktop.webp; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /img/background-mobile.webp; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /img/favicon-32x32.png; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Dependencia de assets/entrega do frontend: /img/favicon-source-1024.png; Spring direto HTTP 302; renderizacao nao aprovada |
| BLOQUEADO | dependencias-frontend | Pagina fora desta entrega, dependente do Guilherme: /funcionario; Spring direto HTTP 302 |
| BLOQUEADO | dependencias-frontend | Pagina fora desta entrega, dependente do Guilherme: /funcionario/perfil; Spring direto HTTP 302 |
| BLOQUEADO | dependencias-frontend | Pagina fora desta entrega, dependente do Guilherme: /funcionario/relatorio; Spring direto HTTP 302 |
| BLOQUEADO | dependencias-frontend | Pagina fora desta entrega, dependente do Guilherme: /recuperar-senha; Spring direto HTTP 302 |
| BLOQUEADO | dependencias-frontend | Pagina fora desta entrega, dependente do Guilherme: /first-access; Spring direto HTTP 302 |
| BLOQUEADO | dependencias-frontend | Fluxo visual completo no navegador, CSS/JS/imagens e paginas pendentes dependem da entrega/roteamento do frontend; nao homologados |
| PASSOU | preservacao | Container temporario removido: atesta-pages-redis-7e4d67ea12 |
| PASSOU | preservacao | Container temporario removido: atesta-pages-mysql-7e4d67ea12 |
| PASSOU | preservacao | mysql-dev/node-dev: mesmos IDs, estado, inicio e contadores de reinicio |
| PASSOU | preservacao | Todos os .env/.env.* preservados byte a byte; configuracoes reais nao carregadas |
| PASSOU | preservacao | Paginas e assets originais preservados byte a byte |
