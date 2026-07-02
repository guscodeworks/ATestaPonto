# Sistema de Presença nas Escolas — Ponto-Escolar

Sistema web para controle de presença de funcionários em ambiente escolar. Substitui o controle manual de ponto por um processo digital, seguro e rastreável, combinando login por CPF/senha com leitura obrigatória de QR Code.

**Tecnologias principais:** Node.js · Express.js · MySQL · JavaScript · HTML · CSS · QR Code

## Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [Desenvolvedores](#desenvolvedores)
- [Tecnologias Utilizadas](#tecnologias-utilizadas)
- [Requisitos para Instalação](#requisitos-para-instalação)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Como Executar](#como-executar)
- [Como Usar o Sistema](#como-usar-o-sistema)
- [Funcionalidades Principais](#funcionalidades-principais)
- [Segurança do Sistema](#segurança-do-sistema)
- [Possíveis Erros e Soluções](#possíveis-erros-e-soluções)
- [Observações](#observações)
- [Conclusão](#conclusão)

## Sobre o Projeto

### O que é o Sistema

O Sistema de Presença nas Escolas (**Ponto-Escolar**) é uma aplicação web desenvolvida para controlar a presença de funcionários em ambiente escolar. O sistema substitui o controle manual de presença por um processo digital, seguro e rastreável.

Ao acessar o sistema, o funcionário precisa escanear um QR Code disponível na escola, fazer login com seu CPF e senha e registrar sua entrada ou saída. Todas as ações ficam registradas no banco de dados, permitindo que os administradores acompanhem a presença de forma prática.

### Objetivo do Projeto

O objetivo principal do sistema é registrar a presença de funcionários — e somente funcionários — por meio de login combinado com leitura de QR Code. Isso garante que o registro só pode ser feito presencialmente, dentro da área física da escola, evitando fraudes e marcações remotas.

O sistema possui dois perfis de uso:

- **Funcionário** — acessa a página de ponto, faz login, escaneia o QR Code e registra entrada ou saída.
- **Administrador** — acessa o painel administrativo para gerenciar funcionários, visualizar registros de ponto, gerar QR Codes e consultar relatórios.

## Desenvolvedores

- Dymas Kawam Batista
- Gustavo Nascimento da Silva Braga
- Isaque de Deus Quadros
- Guilherme Daniel Souza
- Eduardo Galvão Pereira
- João Victor da Silvas Alves

## Tecnologias Utilizadas

### Backend (Servidor)

| Tecnologia | Para que serve |
|---|---|
| Node.js | Ambiente de execução do JavaScript no servidor. É o motor que faz o sistema funcionar. |
| Express.js v5 | Framework web que organiza as rotas, middlewares e respostas HTTP do servidor. |
| MySQL2 | Biblioteca que conecta o Node.js ao banco de dados MySQL e executa consultas SQL. |
| bcrypt | Criptografa senhas dos funcionários e administradores antes de salvar no banco de dados. |
| jsonwebtoken (JWT) | Gera e valida tokens de autenticação usados para identificar o funcionário logado. |
| express-session | Gerencia sessões de login para administradores no painel web. |
| express-rate-limit | Limita a quantidade de requisições por IP para evitar ataques de força bruta. |
| helmet | Adiciona cabeçalhos HTTP de segurança para proteger o sistema contra ataques web comuns. |
| cors | Controla quais origens (domínios) podem fazer requisições ao servidor. |
| qrcode | Biblioteca que gera as imagens de QR Code usadas para controle de acesso. |
| dotenv | Carrega variáveis de configuração do arquivo `.env` para o sistema. |
| zod | Valida os dados recebidos nas requisições para garantir que estão no formato correto. |
| express-validator | Valida e sanitiza dados de formulários e requisições HTTP. |
| concurrently | Ferramenta de desenvolvimento que permite iniciar os dois servidores ao mesmo tempo. |

### Frontend (Interface do Usuário)

| Tecnologia | Para que serve |
|---|---|
| HTML5 | Linguagem de marcação usada para criar as páginas do sistema. |
| CSS3 | Linguagem de estilo que define o visual e o layout das páginas. |
| JavaScript (Vanilla) | Linguagem de programação usada para tornar as páginas interativas no navegador. |

### Banco de Dados

| Tecnologia | Para que serve |
|---|---|
| MySQL | Sistema gerenciador de banco de dados relacional onde são armazenados funcionários, registros de ponto, administradores e logs de auditoria. |

### Autenticação e Segurança

| Tecnologia | Para que serve |
|---|---|
| Gov.br (simulado) | Autenticação dos administradores via protocolo OAuth2/OIDC simulado localmente para fins de desenvolvimento e demonstração. |
| PKCE (Proof Key for Code Exchange) | Técnica de segurança extra usada no fluxo de autenticação OAuth2 para evitar interceptação do código de autorização. |
| HMAC SHA-256 | Algoritmo criptográfico usado para gerar o token do QR Code de forma segura. |

## Requisitos para Instalação

Para que o sistema funcione corretamente, os seguintes programas devem estar instalados no computador:

| Programa | Descrição |
|---|---|
| Node.js | Versão 18 ou superior. É o ambiente que executa o código JavaScript do servidor. |
| npm | Gerenciador de pacotes do Node.js, instalado automaticamente com o Node.js. |
| MySQL | Versão 8.0 ou superior. Banco de dados onde todas as informações são armazenadas. |
| Git (opcional) | Utilizado para clonar o repositório do projeto. |

> [!TIP]
> Verifique se o Node.js está instalado rodando o comando `node --version` no terminal. O resultado deve mostrar `v18.0.0` ou superior.

## Estrutura do Projeto

O projeto é dividido em duas pastas principais dentro do diretório `Ponto-Escolar`:

| Pasta | Descrição |
|---|---|
| `ponto-escolar/` | Aplicação principal do sistema — servidor, banco de dados, QR Code e toda a interface. |
| `gov.br-fake/` | Servidor simulador do Gov.br para autenticação do administrador em ambiente local (desenvolvimento). |

### Estrutura da Pasta `ponto-escolar/`

```
ponto-escolar/
├── server.js
├── .env
├── package.json
├── src/
│   ├── app.js
│   ├── config/
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── schemas/
│   ├── scripts/
│   └── utils/
├── views/
│   ├── admin/
│   └── funcionario/
└── public/
    └── assets/
```

| Arquivo / Pasta | Função |
|---|---|
| `server.js` | Ponto de entrada do sistema. Conecta ao banco de dados e inicia o servidor. |
| `.env` | Arquivo de configuração com variáveis de ambiente (portas, banco de dados, chaves secretas). |
| `package.json` | Lista todas as dependências e os comandos do projeto. |
| `src/app.js` | Configura o Express.js com middlewares de segurança, sessão, CORS e rotas. |
| `src/config/` | Configurações do banco de dados, variáveis de ambiente e Gov.br. |
| `src/controllers/` | Lógica de cada ação: login do funcionário, registro de ponto, autenticação do admin, etc. |
| `src/middlewares/` | Funções intermediárias: autenticação JWT, limite de requisições, validação de dados. |
| `src/models/` | Representação das tabelas do banco de dados (funcionários, pontos, cargo, login). |
| `src/routes/` | Define os endereços (URLs) disponíveis no sistema e quem pode acessá-los. |
| `src/services/` | Regras de negócio: como gerar QR Code, registrar ponto, autenticar Gov.br, etc. |
| `src/schemas/` | Schemas de validação de dados com Zod para login, ponto e funcionários. |
| `src/scripts/` | Scripts de linha de comando: inicializar banco, criar administrador. |
| `src/utils/` | Funções auxiliares: validar CPF, calcular distância, gerar token JWT, etc. |
| `views/` | Páginas HTML do sistema (interface visual para admin e funcionários). |
| `views/admin/` | Telas do painel administrativo: dashboard, funcionários, pontos, relatórios, configurações. |
| `views/funcionario/` | Telas do funcionário: login, tela de ponto, perfil, relatório pessoal. |
| `public/assets/` | Arquivos públicos: CSS (estilos), JavaScript do navegador e imagens. |

### Estrutura da Pasta `gov.br-fake/`

```
gov.br-fake/
├── server.js
├── .env
├── src/
│   ├── app.js
│   ├── config/
│   │   └── fakeUsers.js
│   ├── controllers/
│   └── services/
└── views/
```

| Arquivo / Pasta | Função |
|---|---|
| `server.js` | Inicia o servidor simulador do Gov.br na porta 4000. |
| `.env` | Configurações do simulador (porta, usuários fake, client_id, etc.). |
| `src/app.js` | Configura o servidor simulador com rotas de autenticação OAuth2. |
| `src/config/fakeUsers.js` | Define os usuários fictícios disponíveis para login no simulador. |
| `src/controllers/` | Lógica das rotas de autenticação fake (autorizar, gerar token, retornar userinfo). |
| `src/services/` | Serviços de token, código de autorização e PKCE para simular o fluxo OAuth2. |
| `views/` | Telas HTML do simulador Gov.br (tela de login fake). |

## Instalação

Siga os passos abaixo, na ordem indicada, para instalar e configurar o projeto do zero.

### Passo 1 — Baixar o projeto

Se você recebeu o projeto como arquivo ZIP, extraia-o para uma pasta de sua escolha. Se tiver o Git instalado, pode clonar o repositório:

```bash
git clone <URL_DO_REPOSITORIO>
cd Ponto-Escolar
```

### Passo 2 — Instalar as dependências do servidor principal

```bash
cd ponto-escolar
npm install
```

Este comando lê o arquivo `package.json` e baixa automaticamente todas as bibliotecas listadas (Express, bcrypt, JWT, QR Code, etc.).

### Passo 3 — Instalar as dependências do simulador Gov.br

```bash
cd ../gov.br-fake
npm install
```

### Passo 4 — Configurar o banco de dados MySQL

Abra o MySQL e crie o banco de dados do sistema — pelo terminal do MySQL ou por uma ferramenta como MySQL Workbench ou phpMyAdmin:

```sql
CREATE DATABASE ponto CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

> [!TIP]
> O nome `ponto` é o padrão definido no arquivo `.env`. Você pode mudar o nome, mas lembre-se de atualizar o arquivo `.env` também.

### Passo 5 — Inicializar as tabelas do banco de dados

```bash
cd ../ponto-escolar
npm run db:init
```

Este comando cria automaticamente todas as tabelas necessárias no banco de dados usando o arquivo SQL do projeto.

### Passo 6 — Criar o primeiro administrador

```bash
npm run admin:create -- --name="Nome do Admin" --email=admin@escola.com --password=SenhaBemForte123
```

> [!IMPORTANT]
> A senha deve ter entre 12 e 72 caracteres. Use uma senha forte, com letras, números e símbolos.

## Configuração

O projeto usa arquivos `.env` para armazenar todas as configurações importantes. Esses arquivos nunca devem ser compartilhados publicamente, pois contêm informações sensíveis.

### Arquivo `.env` do `ponto-escolar/`

```env
# Servidor
NODE_ENV=development
PORT=3000
SESSION_SECRET=

# Banco de Dados
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=ponto

# Autenticação
JWT_SECRET=
JWT_EXPIRES_IN=8h
FUNCIONARIO_JWT_EXPIRES_IN=20m

# Localização da Escola
SCHOOL_LATITUDE=
SCHOOL_LONGITUDE=
SCHOOL_UNIT_CODE=DEFAULT
ALLOWED_RADIUS_METERS=200
```

**Configurações do Servidor**

| Variável | Descrição |
|---|---|
| `NODE_ENV` | Ambiente de execução. Use `development` para testes e `production` para uso real. |
| `PORT` | Porta onde o servidor vai rodar. Padrão: `3000`. |
| `SESSION_SECRET` | Chave secreta para as sessões dos administradores. Deve ser uma string longa e aleatória. |

**Configurações do Banco de Dados**

| Variável | Descrição |
|---|---|
| `DB_HOST` | Endereço do servidor MySQL. Padrão: `localhost`. |
| `DB_PORT` | Porta do MySQL. Padrão: `3306`. |
| `DB_USER` | Usuário do banco de dados. Padrão: `root`. |
| `DB_PASSWORD` | Senha do banco de dados. Deixe vazio se não houver senha. |
| `DB_NAME` | Nome do banco de dados. Padrão: `ponto`. |

**Configurações de Autenticação**

| Variável | Descrição |
|---|---|
| `JWT_SECRET` | Chave secreta para assinar os tokens JWT dos funcionários. Use uma string longa e aleatória. |
| `JWT_EXPIRES_IN` | Tempo de validade do token do administrador. Padrão: `8h`. |
| `FUNCIONARIO_JWT_EXPIRES_IN` | Tempo de validade do token do funcionário. Padrão: `20m` (20 minutos). |

**Configurações de Localização da Escola**

| Variável | Descrição |
|---|---|
| `SCHOOL_LATITUDE` | Latitude da escola. O funcionário só pode registrar ponto próximo a este ponto. |
| `SCHOOL_LONGITUDE` | Longitude da escola. |
| `SCHOOL_UNIT_CODE` | Código identificador da unidade escolar. Padrão: `DEFAULT`. |
| `ALLOWED_RADIUS_METERS` | Raio em metros ao redor da escola onde o ponto pode ser registrado. Padrão: `200` metros. |

> [!TIP]
> Para localizar as coordenadas da sua escola, acesse o Google Maps, clique com o botão direito no local da escola e anote a latitude e a longitude exibidas.

### Arquivo `.env` do `gov.br-fake/`

O simulador Gov.br tem seu próprio arquivo `.env`. Em ambiente de desenvolvimento, os valores padrão já funcionam.

```env
PORT=4000
GOVBR_FAKE_CLIENT_ID=ponto-escolar
GOVBR_FAKE_CLIENT_SECRET=dev-secret
GOVBR_FAKE_ADMIN_EMAIL=admin@ponto-escolar.local
```

| Variável | Descrição |
|---|---|
| `PORT` | Porta do simulador Gov.br. Padrão: `4000`. |
| `GOVBR_FAKE_CLIENT_ID` | ID do cliente do simulador. Padrão: `ponto-escolar`. |
| `GOVBR_FAKE_CLIENT_SECRET` | Segredo do cliente. Padrão para desenvolvimento: `dev-secret`. |
| `GOVBR_FAKE_ADMIN_EMAIL` | E-mail do administrador fake. Padrão: `admin@ponto-escolar.local`. |

> [!NOTE]
> O simulador Gov.br é apenas para uso em desenvolvimento local. Em produção real, ele deve ser substituído pelo Gov.br oficial.

## Como Executar

### Opção 1 — Iniciar tudo de uma vez (recomendado)

```bash
cd ponto-escolar
npm run dev
```

Este comando inicia automaticamente os dois servidores ao mesmo tempo: o servidor principal (porta 3000) e o simulador Gov.br (porta 4000).

### Opção 2 — Iniciar cada servidor separadamente

Abra dois terminais diferentes:

```bash
# Terminal 1 — Servidor principal
cd ponto-escolar
npm start
```

```bash
# Terminal 2 — Simulador Gov.br
cd gov.br-fake
npm start
```

### Acessando o sistema no navegador

| Endereço | O que abre |
|---|---|
| `http://localhost:3000` | Página inicial do sistema. |
| `http://localhost:3000/funcionario/login` | Tela de login do funcionário. |
| `http://localhost:3000/admin` | Painel administrativo (requer login de admin). |
| `http://localhost:4000` | Interface do simulador Gov.br (apenas desenvolvimento). |

> [!IMPORTANT]
> Sempre verifique se o MySQL está rodando antes de iniciar o sistema. Sem o banco de dados ativo, o servidor não inicia.

## Como Usar o Sistema

### Fluxo do Funcionário — Passo a Passo

1. O administrador gera e exibe o QR Code do dia na escola (através do painel administrativo).
2. O funcionário vai até o local onde o QR Code está exibido (totens, quadro, TV, etc.).
3. O funcionário escaneia o QR Code com a câmera do celular ou acessa a URL impressa/exibida.
4. O sistema abre a tela de login do funcionário automaticamente.
5. O funcionário informa seu CPF (ou e-mail) e sua senha e clica em **Entrar**.
6. O sistema valida o QR Code, o CPF/e-mail e a senha do funcionário.
7. O sistema verifica se o funcionário está dentro da área permitida da escola (geolocalização).
8. Se tudo estiver correto, o ponto é registrado automaticamente como Entrada ou Saída.
9. O sistema exibe a confirmação com o horário registrado.

### Como Funciona o Login do Funcionário

O funcionário pode fazer login usando CPF ou e-mail cadastrado:

| Campo | Descrição |
|---|---|
| CPF ou E-mail | CPF sem pontos e traços (apenas números) ou e-mail cadastrado pelo administrador. |
| Senha | Senha definida pelo administrador no momento do cadastro do funcionário. |

> [!IMPORTANT]
> O login do funcionário exige que o QR Code válido do dia tenha sido lido antes. Sem o QR Code, não é possível registrar ponto.

### Como Funciona o QR Code

O QR Code é o mecanismo central de segurança do sistema. Ele garante que o funcionário está fisicamente presente na escola:

- O QR Code é gerado automaticamente pelo sistema com validade de 10 minutos.
- Cada QR Code é único para o dia e para a unidade escolar.
- O QR Code é renovado automaticamente a cada 10 minutos, tornando impossível reutilizá-lo mais tarde.
- O administrador pode acessar o QR Code pelo painel administrativo e exibi-lo em um monitor, projetor ou impresso.

### Como Registrar Entrada e Saída

O sistema reconhece automaticamente se o registro é de entrada ou saída com base na sequência de batidas do dia:

| Batida | Tipo de Registro |
|---|---|
| 1ª batida do dia | Entrada |
| 2ª batida do dia | Saída para almoço |
| 3ª batida do dia | Retorno do almoço |
| 4ª batida do dia | Saída |

> [!NOTE]
> O sistema aceita no máximo 4 registros por funcionário por dia. Após a 4ª batida, o sistema bloqueia novos registros para aquele dia.

### Painel Administrativo

O administrador acessa o sistema através do Gov.br (simulado em desenvolvimento). Após o login, tem acesso a todas as funcionalidades de gestão.

#### Como Fazer Login como Administrador

1. Acesse `http://localhost:3000/admin` no navegador.
2. Clique no botão de login com Gov.br.
3. O sistema redireciona para a tela de login do simulador Gov.br (`http://localhost:4000`).
4. Use as credenciais de demonstração: e-mail `admin@ponto-escolar.local` e senha `demo123`.
5. Após autenticar, o sistema redireciona de volta para o painel administrativo.

#### Funcionalidades do Painel

| Funcionalidade | O que faz |
|---|---|
| Dashboard | Tela inicial com resumo do dia: quantidade de funcionários presentes, pontos registrados e outras informações. |
| Funcionários | Lista todos os funcionários cadastrados. Permite visualizar, ativar/desativar e editar dados. |
| Registrar Funcionário | Formulário para cadastrar um novo funcionário no sistema com CPF, nome, e-mail, cargo e senha. |
| Pontos do Dia | Mostra todos os registros de ponto do dia atual com horários de entrada e saída de cada funcionário. |
| Relatórios | Permite consultar o histórico de pontos por funcionário e período. |
| QR Code | Exibe o QR Code válido do dia para ser mostrado aos funcionários. |
| Configurações | Configurações gerais do sistema. |

## Funcionalidades Principais

- **Login de Funcionário com QR Code** — o funcionário só consegue fazer login se o QR Code do dia for válido, garantindo que está presencialmente na escola.
- **Registro de Ponto com Geolocalização** — o sistema verifica a localização GPS do funcionário e só permite o registro de ponto se ele estiver dentro do raio definido da escola.
- **Geração Automática de QR Code** — o QR Code é gerado automaticamente com validade de 10 minutos, sem necessidade de intervenção manual constante.
- **Controle de Entrada e Saída** — o sistema identifica automaticamente se o registro é de entrada ou saída com base na sequência de batidas do dia (até 4 por dia).
- **Autenticação de Administrador via Gov.br** — o administrador acessa o sistema usando o protocolo OAuth2/OIDC do Gov.br, garantindo autenticação segura e delegada.
- **Cadastro de Funcionários** — o administrador pode cadastrar, editar, ativar e desativar funcionários pelo painel web.
- **Dashboard de Presença** — painel com resumo visual da presença do dia: funcionários presentes, ausências e registros recentes.
- **Relatórios de Ponto** — consulta ao histórico de pontos por funcionário e por período, facilitando o controle de frequência.
- **Registro de Auditoria** — todas as ações sensíveis (logins, batidas de ponto, tentativas inválidas) são registradas em log para rastreamento.
- **Proteção contra Força Bruta** — o sistema limita automaticamente a quantidade de tentativas de login por IP para evitar ataques.
- **Perfil do Funcionário** — o funcionário pode visualizar seus próprios registros de ponto e dados de perfil.

## Segurança do Sistema

Abaixo estão descritos os recursos de segurança encontrados no código-fonte do projeto.

### Autenticação e Controle de Acesso

| Recurso | Como funciona no código |
|---|---|
| Autenticação via JWT (funcionários) | Após o login, o funcionário recebe um token JWT com validade de 20 minutos assinado com chave secreta. Esse token é enviado em todas as requisições para identificar o funcionário. |
| Sessão segura (administradores) | Administradores usam sessões gerenciadas pelo `express-session` com cookies `httpOnly` e `sameSite: lax`, sem armazenar o token do Gov.br no lado do servidor. |
| Fluxo OAuth2 com PKCE (Gov.br) | A autenticação do admin usa o padrão PKCE (Proof Key for Code Exchange), que adiciona uma camada extra de segurança ao fluxo de login OAuth2. |
| Criptografia de senhas com bcrypt | As senhas de funcionários e administradores são criptografadas com bcrypt antes de serem salvas no banco de dados. As senhas nunca são armazenadas em texto puro. |
| Verificação de usuário ativo no banco | A cada requisição autenticada de funcionário, o sistema consulta o banco de dados para confirmar que o funcionário ainda existe e está ativo, mesmo com o JWT válido. |

### Segurança do QR Code

| Recurso | Como funciona no código |
|---|---|
| QR Code com validade de 10 minutos | O token do QR Code é gerado com HMAC SHA-256 usando data, hora e código da unidade escolar. O sistema verifica se o QR está dentro da janela de tempo válida. |
| QR Code obrigatório no login | O backend exige que o QR Code seja validado antes de aceitar o login do funcionário. Não é possível fazer login sem o QR Code do dia. |
| Comparação segura de tokens | A comparação do QR Code usa a função `crypto.timingSafeEqual` do Node.js, que evita ataques de timing (medir o tempo de resposta para descobrir informações). |

### Proteção da Aplicação

| Recurso | Como funciona no código |
|---|---|
| Helmet.js | Adiciona automaticamente cabeçalhos HTTP de segurança como `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` e outros. |
| CORS controlado | O sistema aceita requisições apenas das origens configuradas em `CORS_ORIGIN`. Origens não permitidas recebem erro 403. |
| Rate Limiting | O sistema limita o número de requisições por IP: 300 requisições a cada 15 minutos no geral, 5 tentativas de login a cada 15 minutos para logins. |
| Validação de entrada com Zod | Todos os dados recebidos pelo servidor são validados usando schemas Zod antes de serem processados, evitando dados malformados. |
| Proteção contra SQL Injection | As consultas ao banco de dados usam parâmetros preparados (`?`) em vez de concatenação direta de strings, protegendo contra injeção SQL. |
| Geolocalização com raio de segurança | O ponto só é registrado se o funcionário estiver dentro do raio configurado (padrão 200 metros) ao redor da escola. |

### Pontos de Atenção Identificados no Projeto

O próprio projeto possui um relatório interno de auditoria de segurança (`RELATORIO_AUDITORIA_SEGURANCA.md`) que identificou alguns pontos a corrigir antes do uso em produção:

> [!WARNING]
> O simulador Gov.br (`gov.br-fake`) **não** deve ser usado em ambiente de produção. Em produção, utilize as URLs reais do Gov.br.

> [!WARNING]
> As coordenadas de localização (latitude/longitude) são enviadas pelo próprio navegador do funcionário, o que permite burla por usuários tecnicamente avançados.

> [!WARNING]
> O JWT do funcionário é armazenado no `sessionStorage` do navegador, tornando-o vulnerável a ataques XSS. Em produção, recomenda-se usar cookies `HttpOnly`.

> [!WARNING]
> O QR Code é determinístico (gerado a partir de uma fórmula fixa), o que significa que pode ser previsto ou reutilizado dentro da janela de 10 minutos se a URL for compartilhada.

> [!NOTE]
> Esses pontos são comuns em projetos acadêmicos e de desenvolvimento. Para uso em ambiente escolar real, recomenda-se revisar e corrigir esses itens antes do lançamento.

## Possíveis Erros e Soluções

| Erro / Sintoma | Possível Causa e Solução |
|---|---|
| Servidor não inicia — erro de conexão com banco de dados | O MySQL não está rodando. Inicie o serviço do MySQL (ex.: `sudo systemctl start mysql` no Linux, ou pelo painel de serviços no Windows). |
| `npm install` — erro de permissão | Falta de permissão na pasta. No Linux/Mac, execute com `sudo`. No Windows, abra o terminal como administrador. |
| `npm run db:init` — nenhum arquivo de schema SQL encontrado | O arquivo SQL de schema não está no local esperado. Verifique se existe um arquivo chamado `ponto.sql` dentro da pasta `ponto-escolar` ou em `database/schema/`. |
| `npm run admin:create` — tabela `admins` não encontrada | O banco de dados ainda não foi inicializado. Execute `npm run db:init` antes de criar o administrador. |
| `npm run admin:create` — já existe um admin com este e-mail | O e-mail informado já está cadastrado no banco. Use um e-mail diferente ou delete o registro existente, se necessário. |
| Login do funcionário — "CPF/email ou senha inválidos" | O CPF, e-mail ou a senha estão incorretos. Verifique os dados cadastrados pelo administrador. O CPF deve ser informado apenas com números, sem pontos ou traços. |
| Login do funcionário — "QR Code inválido ou expirado" | O QR Code já expirou (validade de 10 minutos) ou não foi lido corretamente. Solicite ao administrador que atualize o QR Code e tente novamente. |
| Registro de ponto — "Você só pode bater ponto dentro da área permitida" | O funcionário está fora do raio de distância configurado da escola. Verifique se `SCHOOL_LATITUDE` e `SCHOOL_LONGITUDE` no arquivo `.env` estão corretas. |
| Registro de ponto — "Funcionário já realizou 4 batidas hoje" | O limite de 4 registros diários foi atingido. Não é possível registrar mais pontos naquele dia. |
| Painel admin — redireciona para login Gov.br mas não consegue autenticar | O simulador Gov.br (`gov.br-fake`) pode não estar rodando. Verifique se o segundo servidor está ativo na porta 4000 (`npm start` dentro de `gov.br-fake/`). |
| "Muitas requisições. Tente novamente em instantes" | O sistema bloqueou o IP temporariamente por excesso de tentativas. Aguarde alguns minutos e tente novamente. |
| Porta já em uso — `Error: listen EADDRINUSE` | A porta 3000 (ou 4000) já está sendo usada por outro processo. Feche o outro processo ou altere a variável `PORT` no arquivo `.env`. |

## Observações

Durante a análise do projeto, foram identificados os seguintes pontos que não invalidam o funcionamento do sistema, mas merecem ser registrados:

1. O arquivo de schema SQL (`ponto.sql`) não estava incluído no ZIP enviado. O script `db:init` tenta localizá-lo em `database/schema/ponto.sql`, `ponto (2).sql` ou `ponto.sql`. Certifique-se de que este arquivo existe antes de executar o comando de inicialização do banco.
2. O sistema de auditoria registra eventos apenas em log de console (não em tabela do banco de dados), conforme identificado no próprio relatório de auditoria do projeto. Isso significa que os logs não são persistentes entre reinicializações.
3. O simulador Gov.br (`gov.br-fake`) é exclusivo para uso em desenvolvimento local. Não deve ser exposto à internet ou usado em produção.
4. As variáveis `SESSION_SECRET` e `JWT_SECRET` no arquivo `.env` padrão contêm valores de exemplo. Antes de qualquer uso real, essas chaves devem ser substituídas por strings longas e aleatórias geradas com segurança.
5. O projeto possui um relatório de auditoria de segurança completo no arquivo `RELATORIO_AUDITORIA_SEGURANCA.md`, com 12 achados categorizados por severidade e sugestões de correção.

## Conclusão

O Sistema de Presença nas Escolas (Ponto-Escolar) representa uma solução completa e moderna para o controle de presença de funcionários em ambiente escolar. O projeto combina tecnologias amplamente utilizadas no mercado — Node.js, Express.js, MySQL, JWT e QR Code — para criar um sistema funcional, seguro e de fácil utilização.

O uso do QR Code como mecanismo de verificação presencial é o diferencial do sistema: garante que o funcionário está fisicamente no local no momento do registro, algo que controles baseados apenas em senha não conseguem assegurar. A integração com geolocalização reforça ainda mais essa característica.

Do ponto de vista técnico, o projeto demonstra boas práticas de desenvolvimento: uso de middlewares de segurança (Helmet, CORS, Rate Limit), validação de dados com Zod, criptografia de senhas com bcrypt, autenticação por JWT e organização em camadas (controllers, services, models, routes).

Este manual foi elaborado para facilitar a instalação, configuração e uso do sistema por qualquer pessoa com conhecimentos básicos de programação web e linha de comando. Com as informações aqui apresentadas, é possível colocar o sistema em funcionamento, entender seu fluxo principal e solucionar os erros mais comuns.

O projeto demonstra que é possível criar soluções tecnológicas relevantes e com aplicação real no contexto escolar, contribuindo para a digitalização e modernização da gestão de recursos humanos em instituições de ensino.
