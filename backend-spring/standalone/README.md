# Runtime Spring isolado

Esta stack e opt-in e inicia somente Spring, MySQL e Redis proprios. Nao usa arquivos
de ambiente, redes, volumes ou processos do gateway/ATestaID. Execute os comandos
abaixo a partir de `backend-spring/standalone`, com Docker Engine/Desktop em modo
containers Linux e Compose v2.20 ou superior. No PowerShell, use `curl.exe` no
comando de verificacao HTTP.
O build via Compose requer o plugin Buildx/BuildKit. Em hosts com apenas o builder
legado, construa com `docker build -t atestaponto-spring-standalone:local ..` e
execute os demais comandos Compose normalmente, sem `--build`.

1. Copie `.env.example` para `.env` (`cp` no Linux; `Copy-Item` no PowerShell).
2. Preencha as senhas locais, as tres chaves independentes (minimo 32 bytes) e o
   provedor OAuth autorizado. O cliente OAuth deve aceitar o callback exato
   `http://localhost:18081/auth/govbr/callback`; use HTTPS se o provedor exigir.
   Nao reutilize credenciais de producao. Proteja as permissoes do `.env` local.
   Variaveis ja exportadas no terminal prevalecem sobre `--env-file`; use um
   terminal sem configuracoes de outros ambientes.
3. Valide sem imprimir segredos e construa a imagem:

   ```sh
   docker compose --env-file .env -f compose.yaml config --quiet
   docker compose --env-file .env -f compose.yaml build spring
   ```

4. Quando autorizado a inicializar os bancos locais vazios, aplique o schema
   manualmente antes de iniciar o Spring (veja os limites abaixo):

   ```sh
   docker compose --env-file .env -f compose.yaml run --rm init-schema
   docker compose --env-file .env -f compose.yaml up -d --wait
   docker compose --env-file .env -f compose.yaml ps
   curl --fail http://localhost:18081/ready
   ```

5. Para parar, preservando os volumes:

   ```sh
   docker compose --env-file .env -f compose.yaml down
   ```

O projeto Compose tem nome `atestaponto-spring-standalone`; nao altere `-p` para o nome
de outro ambiente. Apenas Spring publica porta, em `127.0.0.1:18081`. MySQL e Redis
ficam na rede `data` interna, sem portas no host. Somente Spring tambem participa
da rede de saida, necessaria para OAuth, BrasilAPI e SMTP. As senhas devem ser
configuradas antes da primeira inicializacao: mudar o `.env` nao muda senhas de um
volume MySQL ja inicializado. Nao use `down -v` se quiser preservar os dados locais.

## Schema manual (opt-in)

```sh
docker compose --env-file .env -f compose.yaml run --rm init-schema
```

O servico `init-schema`, no profile `schema`, usa somente o cliente da mesma imagem
MySQL fixada na stack. O comando inicia apenas sua dependencia `mysql`, se
necessario, e aguarda o healthcheck; nao inicia Spring, Redis, Node ou Express.
Conecta ao MySQL desta stack pela rede interna `data`, com `DB_NAME`, `DB_USER` e
`DB_PASSWORD` ja configurados. Nao usa root, cria outro servidor ou le `.env` de
outros projetos. Nao utiliza `backend-spring/scripts/bootstrap-db.py`.

O arquivo `atesta-gateway/database/schema/ponto.sql` e montado diretamente, somente
para leitura, sem copia do SQL. O banco deve existir e estar sem tabelas ou views:
qualquer tabela, mesmo vazia ou de uma inicializacao parcial, causa recusa antes
da importacao. Falhas de conexao/consulta tambem interrompem o comando.

Somente o baseline e aplicado: `ponto_idempotencia` ja esta incluido e a migration
`20260908_ponto_idempotencia.sql` nao e reaplicada. Nenhuma migration e executada;
migrations futuras precisam de revisao e procedimento proprio.

Execute com Spring parado e sem outros clientes gravando no banco. A verificacao
de banco vazio nao bloqueia escritas concorrentes. DDL MySQL nao tem rollback: se
a importacao falhar depois de criar tabelas, uma nova tentativa sera recusada.
O comando nao limpa, completa ou repara o banco; a recuperacao exige revisao manual
autorizada. Nao remova volumes existentes para tentar novamente.

`up` normal e o startup do Spring nunca aplicam o schema. Nao habilite o profile
`schema` em comandos `up`; use somente o `run --rm init-schema` explicito acima.
O schema nao fornece usuarios administrativos nem dados de exemplo. O comando
exige o checkout do repositorio com o arquivo canonico acessivel ao Docker; em
Windows, requer Docker Desktop com containers Linux e compartilhamento da pasta.

## Build e seguranca

- Build em Maven 3.9.11/Java 21 e runtime JRE 21, com bases fixadas por digest,
  dependencias/plugins nas versoes do POM e timestamp fixo do JAR. O contexto
  inclui apenas POM e fontes/recursos; `.env`, Git e artefatos locais ficam fora.
  Nenhum segredo e passado ao build. A imagem executa como UID/GID 10001, sem
  Maven/JDK. O Compose usa filesystem somente leitura, `/tmp` efemero, sem
  capabilities e sem elevacao de privilegios.
- Para comparar builds, use o mesmo codigo, digests e plataforma, e compare o
  SHA-256 de `/app/app.jar`. O digest da imagem inteira pode variar conforme o
  builder/metadados. Atualizacoes de bases exigem revisar e substituir os digests.
- Sessao administrativa sempre em Redis; QR, sessao de ponto e rate limiting tambem
  usam Redis (`REDIS_ENABLED=true`), com namespace exclusivo. O cliente QR/rate limit
  existente nao suporta senha/TLS. Por isso, este Redis local nao tem autenticacao
  nem TLS e so aceita acesso pela rede interna da stack. Nao e uma configuracao
  pronta para Redis gerenciado ou rede compartilhada.
- O exemplo faz opt-in para cookies em HTTP local. Em HTTPS, configure
  `NODE_ENV=production`, `ADMIN_SESSION_SECURE=true`, `CORS_ORIGIN`, `APP_BASE_URL`
  e callback/logout OAuth coerentes com a origem publica, sem curingas. Cookies
  HttpOnly/SameSite e protecoes OAuth/HMAC existentes sao preservados.
- TLS/reverse proxy nao sao provisionados. Se houver proxy, configure
  `SERVER_FORWARD_HEADERS_STRATEGY=native` e uma expressao de IPs estritamente
  confiaveis em `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES` ou
  `SERVER_TOMCAT_REMOTEIP_TRUSTED_PROXIES`; mantenha o acesso direto restrito.
  O padrao local ignora forwarded headers. Nao confie em toda rede privada.
- SMTP fica desligado por padrao. Para testes de e-mail, preencha um SMTP de testes
  e habilite `MAIL_ENABLED`; o transporte usa as configuracoes existentes de TLS.
  Nao imprima `docker compose config` sem `--quiet`: ele expande os segredos.
  Administradores do host/Docker ainda podem inspecionar variaveis dos containers.

## Limites

Por padrao, o MySQL inicializa apenas um banco vazio e um usuario local. Tabelas de
dominio so sao criadas pelo comando manual acima; nao ha migrations, dumps ou
seeds automaticos. Os fluxos de dominio exigem o schema e dados ficticios
previamente provisionados por uma tarefa autorizada.
Nao conecte esta stack ao banco real para contornar essa dependencia.

O healthcheck usa `GET /ready`: HTTP 200 e `{"status":"UP"}` somente com MySQL
(`SELECT 1`) e Redis (`PING`) disponiveis; caso contrario, HTTP 503 e
`{"status":"DOWN"}`, sem detalhes internos. `GET /health` continua verificando
apenas MySQL, com o contrato anterior. A prontidao nao valida tabelas de dominio,
OAuth ou SMTP. Redis tambem tem healthcheck proprio. OAuth exige provedor acessivel e cliente cadastrado;
o ambiente nao inclui simulador, credenciais ou bypass de autenticacao.

O empacotamento inclui apenas os recursos ja existentes no Spring. Assets ainda
servidos pelo gateway nao sao copiados; telas podem ficar incompletas. Nao ha
alteracao das paginas ou assets existentes. Build/pull exigem acesso ao Docker Hub e Maven
Central; runtime exige saida para as integracoes configuradas. Nao ha deploy,
certificados, backup, observabilidade ou configuracao de infraestrutura existente.
