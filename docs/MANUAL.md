# Sistema de Presença nas Escolas — ATestaPonto

O ATestaPonto é um sistema web criado para modernizar o controle de presença de funcionários em ambiente escolar. Desenvolvido por alunos do curso Técnico em Desenvolvimento de Sistemas do Miguel Vicente Cury, o projeto substitui o antigo registro em caderno por um processo digital, seguro e rastreável, combinando login por CPF/senha com leitura de QR Code.

**Tecnologias principais:** Node.js · Express.js · MySQL · JavaScript · HTML · CSS · QR Code


## Sobre o Projeto


### Objetivo do Projeto

O objetivo principal do sistema é registrar a presença de funcionários — por meio de login combinado com leitura de QR Code. Isso garante que o registro só pode ser feito presencialmente, dentro da área física da escola, evitando fraudes e marcações remotas.

O sistema possui dois perfis de uso:

- **Funcionário** — acessa a página de ponto, faz login, escaneia o QR Code e registra entrada ou saída.
- **Administrador** — acessa o painel administrativo para gerenciar funcionários, visualizar registros de ponto, gerar QR Codes e consultar relatórios.

## Desenvolvedores

- Dymas Kawam Batista (backend)
- Gustavo Nascimento da Silva Braga (Lider/backend)
- Isaque de Deus Quadros (frontend)
- Guilherme Daniel Souza (backend)
- Eduardo Galvão Pereira (frontend)
- João Victor da Silvas Alves (frontend)

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

## Instalação

Siga os passos abaixo, na ordem indicada, para instalar e configurar o projeto do zero.

### Passo 1 — Baixar o projeto

Se você recebeu o projeto como arquivo ZIP, extraia-o para uma pasta de sua escolha.

![extraindo_do_zip](img/passo%201/Capturar.PNG)

Se tiver o Git instalado, pode clonar o repositório:

![clonando](img/passo%201/github.clone.PNG)
![clonando](img/passo%201/copiando.clone.PNG)
```bash
git clone <URL_DO_REPOSITORIO>
cd Ponto-Escolar
```
![clonando_reposítorio](img/passo%201/cloanando.PNG)


### Passo 2 — Instalar as dependências do servidor principal

```bash
cd ponto-escolar
npm install
```
![instalando_dependencias_ponto](img/passo%202/instalando_dependencias.PNG)

Este comando lê o arquivo `package.json` e baixa automaticamente todas as bibliotecas listadas (Express, bcrypt, JWT, QR Code, etc.).

### Passo 3 — Instalar as dependências do simulador Gov.br

```bash
cd ../gov.br-fake
npm install
```
![instalando_dependencias_do_gov](img/passo%203/instalando_depedencias_gov.PNG)

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

## Configuração

O projeto usa arquivos `.env` para armazenar todas as configurações importantes. Esses arquivos nunca devem ser compartilhados publicamente, pois contêm informações sensíveis.

### Arquivo `.env.example` do `ponto-escolar/`
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

O simulador Gov.br tem seu próprio arquivo `.env.example`. Em ambiente de desenvolvimento, os valores padrão já funcionam.

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
| `http://localhost:3000/admin/dashboard` | dashboard admin (requer login de admin). |

> [!IMPORTANT]
> Sempre verifique se o MySQL está rodando antes de iniciar o sistema. Sem o banco de dados ativo, o servidor não inicia.

## Como Usar o Sistema

### Como Funciona o Login do Funcionário

O funcionário pode fazer login usando CPF ou e-mail cadastrado:

![tela_de_login](img/tela_de_login.jpeg)

| Campo | Descrição |
|---|---|
| CPF ou E-mail | CPF sem pontos e traços (apenas números) ou e-mail cadastrado pelo administrador. |
| Senha | Senha definida pelo administrador no momento do cadastro do funcionário. |

> [!IMPORTANT]
> O login do funcionário exige que o QR Code válido do dia tenha sido lido antes. Sem o QR Code, não é possível registrar ponto.
>No primeiro login do funcionário a senha será o adm que mandara
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