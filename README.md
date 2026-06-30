# ATestaPonto

ATestaPonto é o sistema de controle de ponto escolar deste Trabalho de Conclusão de Curso técnico. O repositório reúne o sistema principal, a autenticação administrativa e o simulador local usado na demonstração.

Neste TCC, o foco é mostrar um fluxo de controle de jornada para ambiente escolar com autorização interna no back-end e um simulador local para a parte de identidade.

## Status do projeto

| Item | Estado atual |
| --- | --- |
| Fase | TCC técnico em desenvolvimento |
| Sistema principal | Implementado na pasta `ponto-escolar` |
| Autenticação administrativa | Fluxo OAuth/OIDC implementado para uso com o simulador local |
| Integração oficial com Gov.br | A confirmar, depende de cadastro, endpoints e credenciais oficiais |
| Banco de dados | Acesso MySQL implementado; schema SQL ainda não versionado |
| Testes automatizados | Ainda não disponíveis |
| Uso em produção | Não configurado nem declarado como pronto |

## Sumário

- [Contexto do TCC](#contexto-do-tcc)
- [Objetivo](#objetivo)
- [Projetos do repositório](#projetos-do-repositório)
- [Regra central de autenticação e autorização](#regra-central-de-autenticação-e-autorização)
- [Funcionalidades implementadas](#funcionalidades-implementadas)
- [Tecnologias](#tecnologias)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração de ambiente](#configuração-de-ambiente)
- [Banco de dados](#banco-de-dados)
- [Como executar](#como-executar)
- [Fluxo administrativo Gov.br/OIDC](#fluxo-administrativo-govbroidc)
- [Fluxo de registro de ponto](#fluxo-de-registro-de-ponto)
- [QR Code](#qr-code)
- [Rotas principais](#rotas-principais)
- [Segurança](#segurança)
- [Status atual e pontos a evoluir](#status-atual-e-pontos-a-evoluir)
- [Próximos passos](#próximos-passos)
- [Aviso sobre o gov.br-fake](#aviso-sobre-o-govbr-fake)

## Contexto do TCC

O TCC usa o ATestaPonto para demonstrar controle de jornada em ambiente escolar. O desenho do projeto separa três pontos que eu precisei tratar de forma distinta no código: identidade, autorização administrativa e registro de ponto.

No repositório, `ponto-escolar` guarda o sistema principal e `gov.br-fake` guarda o simulador local do Gov.br/Login Único. Os nomes das pastas continuam nos comandos, caminhos, pacotes e rotas.

## Objetivo

O sistema atende dois fluxos. No administrativo, a identidade passa por Gov.br/OIDC e o ATestaPonto decide se aquele usuário entra no painel. No fluxo do funcionário, o login usa CPF ou e-mail e senha, emite um JWT e libera o registro de até quatro batidas por dia dentro da área geográfica configurada.

A área administrativa cadastra funcionários, consulta presença e gera relatórios diários. O QR Code leva o funcionário para a tela de ponto.

## Projetos do repositório

| Projeto | Responsabilidade | Persistência |
| --- | --- | --- |
| [`ponto-escolar`](./ponto-escolar) | Sistema principal do ATestaPonto, com páginas web, APIs, autorização administrativa, funcionários, ponto e relatórios | MySQL para os dados da aplicação; sessão administrativa configurada com `express-session` |
| [`gov.br-fake`](./gov.br-fake) | Simulador local do fluxo de autorização, emissão de código, troca por token e consulta de `/userinfo` | Memória do processo |

Os projetos possuem `package.json`, dependências e configuração próprios. Não existe um `package.json` na raiz.

## Regra central de autenticação e autorização

> **Gov.br autentica. ATestaPonto autoriza.**

O Gov.br, ou o simulador local, confirma a identidade no fluxo OAuth/OIDC. Depois disso, o `ponto-escolar` compara o identificador recebido com a lista interna de administradores antes de criar a sessão administrativa.

Token válido confirma autenticação no provedor. Ele não dá permissão administrativa sozinho. O back-end do `ponto-escolar` faz essa verificação e protege páginas e APIs com `req.session.admin`.

O `gov.br-fake` existe para desenvolvimento, estudo e apresentação local. Ele não representa o serviço oficial do Gov.br.

## Funcionalidades implementadas

### Sistema principal

- autenticação administrativa por fluxo OAuth/OIDC com `state` e PKCE `S256`;
- autorização administrativa por `sub` ou e-mail configurado no back-end;
- sessão administrativa regenerada após o login e proteção de páginas e APIs;
- cadastro, listagem, edição, ativação e desativação de funcionários;
- login de funcionário com CPF ou e-mail e senha, emissão de JWT e nova consulta ao banco para confirmar o estado ativo;
- registro de entrada, saída para almoço, retorno do almoço e saída, com validação de latitude, longitude, raio permitido e transação no banco;
- resumo de presença e relatório diário;
- validação de dados com `express-validator`, tratamento centralizado de erros, sanitização de logs, rate limiting, CORS e cabeçalhos de segurança.

### Simulador Gov.br

- tela local de autenticação demonstrativa;
- endpoint de autorização com `response_type=code`;
- validação de `client_id`, `redirect_uri` e PKCE `S256`;
- emissão e consumo único de authorization code;
- troca do código por access token e consulta de identidade pelo endpoint `/userinfo`;
- sessão local em cookie `HttpOnly`;
- expiração e limpeza de sessões, códigos e tokens armazenados em memória.

## Tecnologias

### Base do projeto

- Node.js;
- CommonJS;
- npm;
- HTML, CSS e JavaScript no front-end.

### `ponto-escolar`

- Express 5;
- MySQL com `mysql2`;
- `express-session`;
- JSON Web Token com `jsonwebtoken`;
- bcrypt;
- `express-validator`;
- `express-rate-limit`;
- Helmet;
- CORS;
- dotenv.

### `gov.br-fake`

- Express 5;
- fluxo OAuth 2.0/OpenID Connect simulado;
- PKCE `S256`;
- armazenamento em memória com `Map`;
- dotenv.

## Estrutura de pastas

```text
.
├── AGENTS.md
├── README.md
├── ponto-escolar/
│   ├── .env.example
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── public/
│   │   └── assets/
│   ├── views/
│   │   ├── admin/
│   │   └── funcionario/
│   └── src/
│       ├── app.js
│       ├── config/
│       ├── controllers/
│       ├── middlewares/
│       ├── models/
│       ├── routes/
│       ├── scripts/
│       ├── services/
│       └── utils/
└── gov.br-fake/
    ├── .env.example
    ├── server.js
    ├── package.json
    ├── package-lock.json
    ├── public/
    ├── views/
    │   └── page/
    └── src/
        ├── app.js
        ├── config/
        ├── controllers/
        ├── models/
        ├── repositories/
        ├── routes/
        ├── services/
        └── utils/
```

O `ponto-escolar` segue uma estrutura MVC com services:

- `routes`: define URLs e encadeia middlewares e controllers;
- `controllers`: recebe `req` e `res`, chama os services e monta a resposta HTTP;
- `services`: concentra regras de negócio e integrações;
- `models`: executa consultas SQL;
- `middlewares`: valida autenticação, autorização, entrada e limites de requisição;
- `utils`: reúne funções pequenas compartilhadas.

## Pré-requisitos

- Node.js 18 ou superior, conforme o campo `engines` dos dois projetos;
- npm;
- MySQL acessível pelo `ponto-escolar`;
- navegador com acesso à localização para registrar ponto pela interface.

## Instalação

O repositório não possui instalação única na raiz. Instale cada projeto em sua pasta.

```bash
cd ponto-escolar
npm ci

cd ../gov.br-fake
npm ci
```

Os dois projetos possuem `package-lock.json`, por isso os passos acima usam `npm ci`.

## Configuração de ambiente

Cada projeto carrega seu próprio arquivo `.env`. O repositório inclui exemplos documentados:

- [`ponto-escolar/.env.example`](./ponto-escolar/.env.example);
- [`gov.br-fake/.env.example`](./gov.br-fake/.env.example).

Copie os arquivos antes da primeira execução:

```bash
cp ponto-escolar/.env.example ponto-escolar/.env
cp gov.br-fake/.env.example gov.br-fake/.env
```

Substitua todos os valores de exemplo antes de usar o sistema fora de uma demonstração local. Não envie os arquivos `.env` para o Git.

### Sistema principal

O arquivo `ponto-escolar/.env` reúne:

- porta e ambiente da aplicação;
- conexão e limite do pool MySQL;
- secrets e duração de JWT e sessão;
- coordenadas da escola e raio permitido;
- origens CORS e limites de requisição;
- endpoints e credenciais do provedor OAuth/OIDC;
- allowlist administrativa por `sub` ou e-mail.

O carregamento da configuração exige:

- `JWT_SECRET` e `SESSION_SECRET` diferentes, com ao menos 32 caracteres;
- conexão MySQL, porta, coordenadas, raio e CORS em formatos válidos;
- ao menos um valor em `ADMIN_GOVBR_SUBS` ou `ADMIN_GOVBR_EMAILS`;
- `GOVBR_FAKE_CLIENT_ID`, `GOVBR_FAKE_CLIENT_SECRET` e callback para o fluxo local.

O código também aceita aliases legados documentados no `.env.example`. Para uma integração oficial, os valores de `GOVBR_AUTHORIZE_URL`, `GOVBR_TOKEN_URL`, `GOVBR_USERINFO_URL`, client ID, client secret e callback dependem do cadastro da aplicação no Gov.br.

### Simulador local

O arquivo `gov.br-fake/.env` define:

- host e porta do simulador;
- client ID e client secret usados na integração local;
- callback e URL inicial do `ponto-escolar`;
- identidade fictícia retornada por `/userinfo`.

O client ID, o client secret, o callback, o `sub` e o e-mail administrativo precisam estar alinhados com a configuração do sistema principal. Use somente dados fictícios no simulador.

## Banco de dados

O `ponto-escolar` abre a conexão MySQL antes de iniciar o servidor. Se o banco não estiver acessível, o processo encerra a inicialização.

O código consulta as seguintes tabelas:

- `admins`;
- `funcionarios`;
- `login`;
- `cargo`;
- `registro_de_pontos`.

Execute estes comandos a partir de `ponto-escolar/`:

```bash
# Inicializa o banco a partir de um schema localizado pelo script
npm run db:init

# Executa um arquivo SQL que esteja dentro de ponto-escolar/
npm run db:run -- --file=caminho/arquivo.sql

# Cria um registro na tabela admins
npm run admin:create -- \
  --name="Nome do administrador" \
  --email="admin@exemplo.local" \
  --password="<senha_com_12_ou_mais_caracteres>"
```

O comando `admin:create` grava um administrador na tabela `admins`. O fluxo administrativo ativo usa Gov.br/OIDC e a allowlist `ADMIN_GOVBR_SUBS` ou `ADMIN_GOVBR_EMAILS`; criar esse registro não substitui a autorização do fluxo Gov.br.

Consulte [Status atual e pontos a evoluir](#status-atual-e-pontos-a-evoluir) antes de executar `db:init` em uma instalação nova.

## Como executar

### Opção 1: processos separados

Inicie o simulador:

```bash
cd gov.br-fake
npm start
```

Em outro terminal, inicie o sistema principal:

```bash
cd ponto-escolar
npm start
```

Endereços padrão da configuração local:

- sistema principal: `http://localhost:3000`;
- dashboard administrativo: `http://localhost:3000/admin/dashboard`;
- início do fluxo administrativo: `http://localhost:3000/auth/govbr/login`;
- simulador: `http://localhost:4000/govbr`;
- health check principal: `http://localhost:3000/health`;
- health check do simulador: `http://localhost:4000/health`.

### Opção 2: execução conjunta

O script `dev` usa `concurrently` para iniciar os dois processos:

```bash
cd ponto-escolar
npm run dev
```

Esse comando pressupõe que as dependências foram instaladas nas duas pastas.

### Outros comandos

No `ponto-escolar`:

```bash
npm run start:ponto
npm run start:govbr
```

No `gov.br-fake`:

```bash
npm run check
```

Esse comando valida a sintaxe do arquivo `gov.br-fake/server.js`.

## Fluxo administrativo Gov.br/OIDC

```text
Navegador
   |
   | acessa /admin/dashboard
   v
ponto-escolar verifica req.session.admin
   |
   | sem sessão
   v
/auth/govbr/login
   |
   | gera state, codeVerifier e codeChallenge
   v
Gov.br ou gov.br-fake
   |
   | autentica a identidade e retorna code + state
   v
/auth/govbr/callback
   |
   | valida state e troca code por token com PKCE
   v
/userinfo
   |
   | retorna sub, nome e e-mail
   v
ponto-escolar consulta sua allowlist
   |
   | autorizado
   v
cria req.session.admin e libera o dashboard
```

O back-end executa esta sequência:

1. O middleware procura `req.session.admin`.
2. O controller gera `state`, `codeVerifier` e `codeChallenge`.
3. A sessão guarda os dados temporários do fluxo.
4. O provedor devolve um authorization code no callback.
5. O back-end rejeita callback que tente enviar `access_token` pela URL.
6. O back-end compara o `state` recebido com o valor da sessão.
7. O service troca o código por token e envia o `code_verifier`.
8. O service consulta `/userinfo` com `Authorization: Bearer`.
9. O `ponto-escolar` compara `sub` ou e-mail com a configuração administrativa.
10. O controller regenera a sessão e grava `req.session.admin`.

As páginas administrativas e as rotas `/api/admin/*` repetem a verificação da sessão e da allowlist. O front-end não decide quem possui acesso administrativo.

## Fluxo de registro de ponto

1. O funcionário informa CPF ou e-mail e senha.
2. O service compara a senha com o hash bcrypt armazenado.
3. O back-end confirma que o funcionário está ativo.
4. O sistema emite um JWT com o papel `funcionario`.
5. A requisição de ponto envia o JWT no cabeçalho `Authorization: Bearer`.
6. O middleware valida o JWT e consulta o funcionário no banco.
7. O back-end valida latitude e longitude.
8. O service calcula a distância até as coordenadas da escola.
9. Uma transação bloqueia o funcionário e o registro do dia durante a atualização.
10. O sistema registra a próxima batida disponível.

A ordem diária é:

1. `ENTRADA`;
2. `SAIDA_ALMOCO`;
3. `VOLTA_ALMOCO`;
4. `SAIDA`.

Após a quarta batida, uma nova tentativa retorna conflito. O sistema calcula data e horário com o fuso `America/Sao_Paulo`.

## QR Code

O back-end gera um atalho fixo para:

```text
/ponto/acessar
```

Ele direciona o funcionário para a tela de acesso ao ponto. O QR Code não contém credencial de login, token de funcionário ou autorização administrativa.

O funcionário ainda precisa se autenticar, enviar um JWT válido e cumprir a validação de localização para registrar o ponto.

## Rotas principais

### `ponto-escolar`

| Método | Rota | Função |
| --- | --- | --- |
| `GET` | `/health` | Verifica se o processo HTTP está respondendo |
| `GET` | `/auth/govbr/login` | Inicia o fluxo administrativo |
| `GET` | `/auth/govbr/callback` | Processa o authorization code |
| `GET` ou `POST` | `/auth/govbr/logout` | Encerra a sessão administrativa |
| `GET` | `/admin/dashboard` | Exibe o dashboard protegido |
| `GET` | `/ponto/acessar` | Exibe a entrada para o fluxo de ponto |
| `POST` | `/ponto/login` | Autentica o funcionário |
| `POST` | `/ponto/registrar` | Registra a próxima batida |
| `POST` | `/ponto/bater` | Alias para registro da próxima batida |
| `GET` | `/api/admin/auth/me` | Consulta a sessão administrativa |
| `GET` ou `POST` | `/api/admin/funcionarios` | Lista ou cadastra funcionários |
| `PATCH` | `/api/admin/funcionarios/:id` | Altera dados do funcionário |
| `PATCH` | `/api/admin/funcionarios/:id/status` | Altera o estado ativo do funcionário |
| `GET` | `/api/admin/pontos/hoje` | Consulta presença por data |
| `GET` | `/api/admin/pontos/relatorio` | Gera o relatório diário |
| `GET` | `/api/admin/pontos/resumo` | Consulta o resumo do dashboard |

As rotas de login e registro de ponto também aparecem sob `/api/pontos`.

### `gov.br-fake`

| Método | Rota | Função |
| --- | --- | --- |
| `GET` | `/govbr` | Exibe a tela simulada |
| `GET` | `/health` | Informa o estado do simulador |
| `GET` | `/service-info` | Lista informações e rotas do serviço local |
| `GET` | `/fake-govbr/authorize` | Valida a solicitação e emite authorization code |
| `POST` | `/fake-govbr/login` | Cria a sessão de usuário simulado |
| `GET` | `/fake-govbr/logout` | Remove a sessão simulada |
| `GET` | `/fake-govbr/session` | Consulta a sessão local |
| `POST` | `/fake-govbr/token` | Troca o código por access token |
| `GET` | `/fake-govbr/userinfo` | Retorna os dados do usuário do token |

## Segurança

Guarde senhas, client secrets, chaves JWT e secrets de sessão em `.env`. Use valores diferentes para `JWT_SECRET` e `SESSION_SECRET`. Não envie access token pela URL.

O login administrativo começa em `/auth/govbr/login`. Preserve a validação de `state` e PKCE, autorize administradores no `ponto-escolar` e não confie em cargo, papel ou permissão vindos do front-end.

O QR Code não prova identidade nem permissão. Use dados fictícios no simulador, não exponha o `gov.br-fake` como serviço oficial e restrinja `CORS_ORIGIN` aos endereços usados pela aplicação.

O back-end usa consultas parametrizadas nas operações MySQL, bcrypt para senhas, cookies `HttpOnly`, validação de entrada, limite de corpo, rate limiting e sanitização de dados nos logs.

## Status atual e pontos a evoluir

O código já cobre o fluxo local entre o sistema principal e o simulador, as páginas administrativas, o cadastro de funcionários, o login de funcionário, a validação geográfica e o registro de quatro batidas.

O repositório já inclui arquivos `.env.example` para os dois projetos, requisito de Node.js 18 ou superior nos dois `package.json`, comando `npm run check` funcional no `gov.br-fake` e scripts para iniciar os serviços e executar operações de banco.

O que ainda fica como ponto a evoluir:

- **Schema SQL versionado:** o script `npm run db:init` procura `database/schema/ponto.sql`, `ponto (2).sql` ou `ponto.sql`, mas o repositório não traz esses arquivos no estado atual. Uma instalação nova precisa de um schema compatível com as tabelas consultadas pelo código.
- **Testes automatizados:** os projetos não possuem suíte de testes nem comando `npm test`.
- **Persistência de sessão administrativa:** o `ponto-escolar` usa o store padrão em memória do `express-session`. Um ambiente com reinício de processo ou mais de uma instância precisa de um store persistente.
- **Persistência do simulador:** sessões, authorization codes e access tokens ficam em memória e desaparecem quando o `gov.br-fake` reinicia. Isso atende ao uso local demonstrativo.
- **Integração oficial:** endpoints, credenciais, cadastro do cliente e regras operacionais do Gov.br real dependem de definição externa ao repositório.
- **Logout por provedor:** o logout administrativo atual redireciona para a rota do `gov.br-fake`. A integração real precisa de configuração própria para encerramento de sessão.
- **QR Code:** o fluxo atual fornece um atalho fixo para a tela de ponto. A rota de desativação não altera esse atalho.

### Informações a confirmar

- schema SQL que será adotado como referência do projeto;
- endpoints e credenciais da integração oficial com Gov.br;
- store de sessão para um ambiente fora da demonstração local;
- estratégia de execução e hospedagem após a conclusão do TCC.

## Próximos passos

1. Versionar um schema SQL revisado e compatível com as consultas atuais.
2. Criar testes para autenticação, autorização, funcionários e registro de ponto.
3. Configurar persistência de sessão antes de executar o sistema em mais de uma instância.
4. Adaptar endpoints e logout quando as credenciais oficiais do Gov.br estiverem disponíveis.
5. Revisar os arquivos de autenticação legada antes de removê-los ou incorporá-los ao fluxo atual.

## Aviso sobre o `gov.br-fake`

O `gov.br-fake` existe para demonstração técnica local. Ele não tem vínculo com o Governo Federal, não substitui o Gov.br ou o Login Único, não deve receber dados pessoais reais e não deve ser usado em produção.

A autorização administrativa pertence ao `ponto-escolar`, mesmo quando o simulador retorna uma identidade autenticada.
