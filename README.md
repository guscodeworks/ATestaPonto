# Manual de Instalação e Uso — ATestaPonto

Sistema web para controle de presença de funcionários em ambiente escolar, combinando autenticação Gov.br, geolocalização e QR Code.

**Tecnologias:** Node.js · Spring Boot · MySQL · JavaScript · HTML · CSS

> [!NOTE]
> Este é o manual prático de instalação, configuração e uso. Para arquitetura e documentação técnica detalhada, consulte [`000.md`](./000.md) e [backend-spring/README.md](./backend-spring/README.md).

## Visão Geral

O sistema registra batidas de ponto de funcionários através de autenticação combinada com geolocalização e leitura de QR Code, garantindo presença física na unidade escolar.

**Arquitetura:**
- **ponto-escolar**: gateway Node.js (servidor principal, autenticação, sessão, RBAC)
- **backend-spring**: backend Java 21 + Spring Boot (em migração gradual via Strangler Pattern)
- **gov.br-fake**: simulador OAuth/OIDC para desenvolvimento local

**Perfis de acesso:**
- **Funcionário**: registra ponto via login + QR Code + geolocalização
- **Administradores**: gerenciam escolas, funcionários, acessos e visualizam relatórios conforme seu escopo territorial (SEDUC, DRE ou unidade escolar)

## Desenvolvedores

- Dymas Kawam Batista (backend)
- Gustavo Nascimento da Silva Braga (líder/backend)
- Isaque de Deus Quadros (frontend)
- Guilherme Daniel Souza (backend)
- João Victor da Silvas Alves (frontend)

## Requisitos

Para instalar e executar o sistema, você precisa de:

| Programa | Versão mínima | Descrição |
|---|---|---|
| **Node.js** | 18 | Ambiente de execução do servidor principal e simulador Gov.br |
| **npm** | — | Gerenciador de pacotes (instalado automaticamente com Node.js) |
| **MySQL** | 8.0 | Banco de dados |
| **Java** (opcional) | 21 | Necessário apenas se for executar o backend Spring localmente |
| **Maven** (opcional) | 3.8+ | Necessário apenas se for executar o backend Spring localmente |
| **Git** (opcional) | — | Facilita clonar o repositório |

> [!TIP]
> Verifique as versões instaladas:
> ```bash
> node --version  # Deve mostrar v18.0.0 ou superior
> npm --version
> mysql --version  # Deve mostrar 8.0 ou superior
> java --version   # Se for usar o Spring, deve mostrar Java 21
> ```

## Instalação

Siga os passos abaixo, na ordem indicada, para instalar e configurar o projeto do zero.

### Passo 1 — Baixar o projeto

Se você recebeu o projeto como arquivo ZIP, extraia-o para uma pasta de sua escolha.

![extraindo_do_zip](docs/img/passo%201/Capturar.PNG)

Se tiver o Git instalado, pode clonar o repositório:

![clonando](docs/img/passo%201/github.clone.PNG)
![clonando](docs/img/passo%201/copiando.clone.PNG)
```bash
git clone <URL_DO_REPOSITORIO>
cd ATestaPonto
```
![clonando_repositorio](docs/img/passo%201/clonando.png)


### Passo 2 — Instalar as dependências do servidor principal

```bash
cd ponto-escolar
npm install
```
![instalando_dependencias_ponto](docs/img/passo%202/instalando_dependencias.PNG)

Este comando lê o arquivo `package.json` e baixa automaticamente todas as bibliotecas listadas (Express, bcrypt, JWT, QR Code, etc.).

### Passo 3 — Instalar as dependências do simulador Gov.br

```bash
cd ../gov.br-fake
npm install
```
![instalando_dependencias_do_gov](docs/img/passo%203/instalando_depedencias_gov.PNG)

### Passo 4 — Configurar o banco de dados MySQL

Abra o MySQL e crie o banco de dados do sistema — pelo terminal do MySQL ou por uma ferramenta como MySQL Workbench ou phpMyAdmin:

```sql
CREATE DATABASE ponto_escolar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

> [!TIP]
> O nome `ponto_escolar` é o padrão definido no arquivo `.env.example` atual do `ponto-escolar`. Você pode mudar o nome, mas lembre-se de atualizar `DB_NAME` também.

### Passo 5 — Inicializar as tabelas do banco de dados

```bash
cd ../ponto-escolar
npm run db:init
```

Este comando cria automaticamente todas as tabelas necessárias no banco de dados usando o arquivo SQL do projeto (`database/schema/ponto.sql`).

> [!IMPORTANT]
> O comando `db:init` exige um banco de dados vazio. Se o banco já contém tabelas, o script será interrompido. Para atualizar a estrutura de um banco existente, use as migrations apropriadas.

## Configuração

O projeto usa arquivos `.env` para armazenar todas as configurações importantes. Esses arquivos nunca devem ser compartilhados publicamente, pois contêm informações sensíveis.

### Configurar o arquivo `.env` do ponto-escolar

1. Copie o arquivo `.env.example` para `.env`:

```bash
cd ponto-escolar
cp .env.example .env
```

2. Abra o arquivo `.env` em um editor de texto e preencha as variáveis obrigatórias:

**Variáveis obrigatórias:**

| Variável | Descrição | Exemplo |
|---|---|---|
| `NODE_ENV` | Ambiente de execução. Use `development` para testes locais. | `development` |
| `DB_HOST` | Endereço do servidor MySQL. | `localhost` ou `127.0.0.1` |
| `DB_USER` | Usuário do banco de dados. | `root` |
| `DB_PASSWORD` | Senha do banco de dados. Deixe vazio se não houver senha. | |
| `DB_NAME` | Nome do banco de dados criado no passo 4. | `ponto_escolar` |
| `JWT_SECRET` | Chave secreta para tokens JWT. Gere com o comando abaixo. | |
| `SESSION_SECRET` | Chave secreta para sessões. Gere com o comando abaixo. | |
| `CORS_ORIGIN` | Origens permitidas. Para desenvolvimento local, use o exemplo abaixo. | `http://127.0.0.1:3000,http://localhost:3000` |
| `INTERNAL_API_SHARED_KEY` | Chave compartilhada para comunicação Node→Spring (mínimo 32 bytes). | |

> [!TIP]
> **Como gerar chaves seguras para JWT_SECRET e SESSION_SECRET:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
> ```
> Execute o comando duas vezes para gerar valores diferentes para cada variável.

**Variáveis opcionais relevantes:**

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta do servidor principal. | `3000` |
| `FUNCIONARIO_JWT_EXPIRES_IN` | Tempo de validade do token de funcionário. | `20m` |
| `GOVBR_AUTHORIZE_URL` | URL de autorização do Gov.br (simulador em dev). | `http://127.0.0.1:4000/fake-govbr/authorize` |
| `GOVBR_TOKEN_URL` | URL de token do Gov.br (simulador em dev). | `http://127.0.0.1:4000/fake-govbr/token` |
| `GOVBR_USERINFO_URL` | URL de userinfo do Gov.br (simulador em dev). | `http://127.0.0.1:4000/fake-govbr/userinfo` |
| `GOVBR_CLIENT_ID` | ID do cliente OAuth. | `ponto-escolar` |
| `GOVBR_CLIENT_SECRET` | Segredo do cliente OAuth (deve coincidir com gov.br-fake). | |
| `GOVBR_REDIRECT_URI` | URI de callback OAuth. | `http://127.0.0.1:3000/auth/govbr/callback` |
| `SPRING_BACKEND_URL` | URL do backend Spring (se for executá-lo). | `http://127.0.0.1:8081` |

### Configurar o arquivo `.env` do gov.br-fake

1. Copie o arquivo `.env.example` para `.env`:

```bash
cd ../gov.br-fake
cp .env.example .env
```

2. Abra o arquivo `.env` e configure:

**Variáveis obrigatórias:**

| Variável | Descrição | Exemplo |
|---|---|---|
| `NODE_ENV` | Ambiente de execução. | `development` |
| `GOVBR_FAKE_CLIENT_ID` | ID do cliente (deve coincidir com ponto-escolar). | `ponto-escolar` |
| `GOVBR_FAKE_CLIENT_SECRET` | Segredo do cliente (deve coincidir com ponto-escolar). | Use o mesmo valor gerado para o ponto-escolar |
| `GOVBR_FAKE_ADMIN_LOGIN` | Login de teste para administrador. | `adminlocal` |
| `GOVBR_FAKE_ADMIN_PASSWORD` | Senha de teste para administrador. | `senhaSegura123` |
| `GOVBR_FAKE_ADMIN_SUB` | CPF do administrador (deve existir no banco). | `12345678900` |

**Variáveis opcionais:**

| Variável | Descrição | Padrão |
|---|---|---|
| `GOVBR_FAKE_PORT` | Porta do simulador Gov.br. | `4000` |
| `PONTO_ESCOLAR_REDIRECT_URI` | URI de callback do ponto-escolar. | `http://127.0.0.1:3000/auth/govbr/callback` |

> [!IMPORTANT]
> O `GOVBR_FAKE_ADMIN_SUB` (CPF) deve corresponder a um usuário administrativo ativo cadastrado no banco de dados para que o login funcione.

### Configurar o backend Spring (opcional)

O backend Spring é opcional para uso básico do sistema. Se você deseja executá-lo:

1. Copie o arquivo `.env.example` para `.env` dentro de `backend-spring`:

```bash
cd ../backend-spring
cp .env.example .env
```

2. Configure as variáveis:

| Variável | Descrição |
|---|---|
| `DB_HOST` | Endereço do MySQL (igual ao ponto-escolar). |
| `DB_PORT` | Porta do MySQL. |
| `DB_USER` | Usuário do banco (igual ao ponto-escolar). |
| `DB_PASSWORD` | Senha do banco (igual ao ponto-escolar). |
| `DB_NAME` | Nome do banco (igual ao ponto-escolar). |
| `INTERNAL_API_SHARED_KEY` | Mesma chave configurada no ponto-escolar. |

> [!NOTE]
> Para executar o Spring via `npm run dev:spring` do ponto-escolar, não é necessário criar o `.env` do Spring. O comando usa as variáveis do ambiente Node. Consulte [backend-spring/README.md](./backend-spring/README.md) para detalhes.

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
| `http://localhost:3000/admin/dashboard` | Dashboard administrativo, com login obrigatório. |

> [!IMPORTANT]
> Sempre verifique se o MySQL está rodando antes de iniciar o sistema. Sem o banco de dados ativo, o servidor não inicia.

## Como Usar o Sistema

### Como Funciona o Login do Funcionário

O funcionário pode fazer login usando CPF ou e-mail cadastrado:

![tela_de_login](docs/img/tela_de_login.png)

| Campo | Descrição |
|---|---|
| CPF ou E-mail | CPF sem pontos e traços (apenas números) ou e-mail cadastrado pelo administrador. |
| Senha | Senha definida pelo administrador no momento do cadastro do funcionário. |

> [!IMPORTANT]
> No cadastro atual, o sistema retorna uma senha temporária uma única vez para o administrador. Essa senha deve ser entregue ao funcionário por um canal seguro definido pela escola.

### Como Registrar as Batidas de Ponto

O sistema reconhece automaticamente o tipo de registro com base na sequência de batidas do dia:

| Batida | Tipo de Registro |
|---|---|
| 1ª batida do dia | Entrada |
| 2ª batida do dia | Saída para almoço |
| 3ª batida do dia | Retorno do almoço |
| 4ª batida do dia | Saída |

**Requisitos para registrar o ponto:**
1. Login válido (CPF/e-mail + senha)
2. Leitura do QR Code da unidade escolar
3. Localização dentro do raio permitido pela escola (geolocalização)

### Perfis Administrativos e Escopos

O sistema possui perfis administrativos hierárquicos com diferentes níveis de acesso:

| Perfil | Escopo Territorial | Principais Capacidades |
|---|---|---|
| **ADMIN_SEDUC** | Estadual (todas as DREs e escolas) | Cadastrar escolas, gerenciar DREs, conceder acessos ADMIN_DIRETORIA/SECRETARIA/COORDENADOR, visualizar relatórios estaduais |
| **ADMIN_DIRETORIA** | Diretoria de Ensino (DRE específica) | Cadastrar escolas da DRE, conceder acessos DIRETOR/VICE_DIRETOR/SECRETARIA/COORDENADOR, visualizar relatórios da DRE |
| **DIRETOR** | Unidade escolar específica | Gerenciar funcionários da escola, gerar QR Code, conceder acessos SECRETARIA/COORDENADOR, visualizar relatórios da escola |
| **VICE_DIRETOR** | Unidade escolar específica | Mesmas capacidades do DIRETOR |
| **SECRETARIA** | Unidade escolar específica | Cadastrar e editar funcionários, gerar QR Code, visualizar ponto e relatórios da escola |
| **COORDENADOR** | Unidade escolar específica | Visualizar funcionários, ponto e relatórios da escola (sem edição) |

**Matriz de Delegação:**
- ADMIN_SEDUC pode conceder: ADMIN_DIRETORIA, SECRETARIA, COORDENADOR
- ADMIN_DIRETORIA pode conceder: DIRETOR, VICE_DIRETOR, SECRETARIA, COORDENADOR
- DIRETOR/VICE_DIRETOR podem conceder: SECRETARIA, COORDENADOR
- SECRETARIA e COORDENADOR não podem conceder acessos

### Funcionalidades Administrativas

#### Cadastro de Escolas

- Disponível para: ADMIN_SEDUC (todas as DREs) e ADMIN_DIRETORIA (apenas sua DRE)
- Integração automática com **BrasilAPI v2** para validação de CEP e obtenção de coordenadas
- O backend Spring processa o cadastro e valida a diretoria de ensino
- Não é necessária chave de API para a consulta de CEP

#### Gestão de Funcionários

- Cadastro inclui: nome, CPF, e-mail, telefone, cargo, horários e vínculo com unidade escolar
- Sistema gera senha temporária no primeiro cadastro
- Perfis com capacidade `funcionario.criar`: ADMIN_SEDUC, ADMIN_DIRETORIA, DIRETOR, VICE_DIRETOR, SECRETARIA

#### Geração de QR Code

- Exclusivo para perfis escolares: DIRETOR, VICE_DIRETOR, SECRETARIA
- QR Code vinculado à unidade escolar do administrador
- Funcionários leem o QR Code para validar presença física na escola

#### Relatórios

O sistema oferece três tipos de relatórios:

| Tipo | Descrição | Filtros |
|---|---|---|
| **Diário** | Registros de ponto de uma data específica | Data, escopo (unidade ou global conforme perfil) |
| **Semanal** | Resumo semanal de registros | Semana (ano + número), escopo |
| **Hierárquico** | Agregação por escola, DRE ou estado | Período, nível de agregação, escopo |

Todos os relatórios respeitam o escopo territorial do administrador autenticado.

## Comandos Disponíveis

### Comandos do ponto-escolar

| Comando | Descrição |
|---|---|
| `npm start` | Inicia o servidor principal (porta 3000) |
| `npm run dev` | Inicia servidor principal + simulador Gov.br simultaneamente |
| `npm run dev:spring` | Inicia o backend Spring usando variáveis do ambiente Node |
| `npm run db:init` | Inicializa o banco de dados vazio com o baseline (ponto.sql) |
| `npm run db:run` | Executa arquivo SQL específico |
| `npm test` | Executa testes automatizados |

### Comandos do gov.br-fake

| Comando | Descrição |
|---|---|
| `npm start` | Inicia o simulador Gov.br (porta 4000) |

## Erros Comuns e Soluções

### Erro: "Cannot connect to MySQL"

**Causa:** MySQL não está rodando ou credenciais incorretas no `.env`.

**Solução:**
1. Verifique se o MySQL está ativo
2. Confirme `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` no `.env`
3. Teste a conexão: `mysql -h localhost -u root -p`

### Erro: "db:init interrompido: banco já contém tabelas"

**Causa:** O comando `db:init` exige banco vazio.

**Solução:**
- Para atualizar estrutura existente, use migrations: `npm run db:run -- <caminho_da_migration>`
- Para recriar do zero (perde dados): delete o banco, recrie e execute `db:init`

### Erro: "JWT_SECRET ou SESSION_SECRET ausente"

**Causa:** Variáveis obrigatórias não configuradas no `.env`.

**Solução:**
1. Gere chaves seguras:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
2. Adicione no `.env` do ponto-escolar

### Erro: "Login administrativo falhou"

**Causa:** CPF retornado pelo Gov.br não tem acesso administrativo ativo no banco.

**Solução:**
1. Verifique se `GOVBR_FAKE_ADMIN_SUB` (CPF) existe na tabela `usuarios_administrativos`
2. Verifique se existe acesso ativo em `acessos_administrativos` para esse usuário
3. Confirme que `GOVBR_FAKE_CLIENT_SECRET` é idêntico em ponto-escolar e gov.br-fake

### Erro: "Funcionário não consegue registrar ponto"

**Possíveis causas:**
1. Geolocalização fora do raio permitido pela escola
2. QR Code inválido ou expirado
3. Funcionário inativo ou vínculo inativo

**Solução:**
1. Verifique coordenadas e raio da escola no banco (`unidades_escolares`)
2. Gere novo QR Code pelo painel administrativo
3. Verifique status do funcionário e vínculo no banco

### Erro: "INTERNAL_API_SHARED_KEY inválida"

**Causa:** Chave Node→Spring ausente, diferente ou menor que 32 bytes.

**Solução:**
1. Gere chave de 48 bytes:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
2. Configure o **mesmo valor** em:
   - `ponto-escolar/.env` → `INTERNAL_API_SHARED_KEY`
   - `backend-spring/.env` → `INTERNAL_API_SHARED_KEY` (se iniciar Spring manualmente)

## Estrutura Mínima para Execução

Para que o sistema funcione corretamente, você precisa de:

1. **Banco de dados inicializado** com `npm run db:init`
2. **Pelo menos um usuário administrativo** cadastrado em `usuarios_administrativos`
3. **Pelo menos um acesso administrativo ativo** em `acessos_administrativos` vinculado ao usuário
4. **CPF do administrador configurado** em `GOVBR_FAKE_ADMIN_SUB` do simulador
5. **Secrets configurados** (`JWT_SECRET`, `SESSION_SECRET`, `INTERNAL_API_SHARED_KEY`)
6. **MySQL rodando** e acessível conforme `DB_HOST` e `DB_PORT`

Para uso completo do sistema (com cadastro de escolas e relatórios via Spring):

7. **Backend Spring** iniciado via `npm run dev:spring` ou manualmente
8. **Diretoria de ensino cadastrada** em `diretorias_ensino` (obrigatória para criar escolas)
