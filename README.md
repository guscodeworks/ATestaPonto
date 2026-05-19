# Ponto Escolar - Backend Seguro

Backend Node.js/Express com foco em seguranca para controle de ponto institucional.

## Requisitos
- Node.js 20+
- MySQL/MariaDB

## Setup rapido
1. Instale dependencias:
```bash
npm install
```
2. Crie o arquivo de ambiente:
```bash
cp .env.example .env
```
3. Preencha a `.env` com valores reais e seguros.
4. Inicialize o banco a partir do `ponto.sql`:
```bash
npm run db:init
```
5. Crie o primeiro admin:
```bash
npm run admin:create -- --name=Administrador --email=admin@dominio.gov.br --password=SenhaForteCom32+Caracteres!
```
6. Inicie a API:
```bash
npm start
```

## Variaveis obrigatorias
- `PORT`
- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `SCHOOL_LATITUDE` (aceita fallback legado `COMPANY_LATITUDE`)
- `SCHOOL_LONGITUDE` (aceita fallback legado `COMPANY_LONGITUDE`)
- `ALLOWED_RADIUS_METERS`
- `CORS_ORIGIN`

## Rotas principais
Base: `/api`

### Publicas
- `GET /ponto` (mesma `index.html` em modo de batida publica)
- `GET /bater-ponto` (alias que redireciona para `/ponto`)
- `POST /pontos/bater`
- `POST /admin/auth/login`
- `GET /health` (fora de `/api`)

### Privadas (JWT Bearer)
- `GET /admin/auth/me`
- `GET /admin/funcionarios`
- `POST /admin/funcionarios`
- `PATCH /admin/funcionarios/:id`
- `PATCH /admin/funcionarios/:id/status`
- `GET /admin/qr-tokens` (retorna o token diario atual)
- `POST /admin/qr-tokens` (retorna o token diario atual)
- `PATCH /admin/qr-tokens/:id/desativar` (nao aplicavel para token diario)
- `POST /admin/qr-tokens/validar`
- `GET /admin/pontos/resumo`
- `GET /admin/pontos/hoje`
- `GET /admin/pontos/relatorio`

## Front-end conectado
- Login web: `/` ou `/index.html`
- Painel admin: `/admin/dashboard.html`
- O front consome a API no mesmo host (`/api`) e usa JWT em `Authorization: Bearer`.
- Sessao armazenada em `localStorage` e validada em cada pagina admin via `/api/admin/auth/me`.

## Seguranca implementada
- JWT para autenticacao admin.
- Senhas somente com hash `bcrypt`.
- `helmet` para headers de seguranca.
- `express-rate-limit` (global, login, rotas sensiveis e ponto).
- CORS restritivo por `CORS_ORIGIN`.
- Validacao/sanitizacao com `express-validator`.
- Queries parametrizadas com `mysql2`.
- Middleware global de erros (sem stack trace em producao).
- CPF mascarado nas respostas.
- Token de QR diario automatico, com rotacao as 00:00 no horario de Brasilia.
- Registro de ponto com transacao + lock SQL + constraint unica (integridade concorrente).
- Auditoria de eventos criticos em `audit_logs`.

## Token QR diario (automatico)
- O token de batida e deterministico por dia e muda automaticamente a cada virada de dia (00:00 em `America/Sao_Paulo`).
- Nao ha necessidade de gravar token de QR em tabela para validacao diaria.
- `POST /api/admin/qr-tokens/validar` valida se um token informado corresponde ao token do dia atual.

## Exemplo de login admin
`POST /api/admin/auth/login`
```json
{
  "email": "admin@dominio.gov.br",
  "senha": "SenhaForteCom32+Caracteres!"
}
```

## Exemplo de batida de ponto
`POST /api/pontos/bater`
```json
{
  "cpf": "12345678909",
  "qrToken": "64_caracteres_hexadecimais",
  "latitude": -23.55052,
  "longitude": -46.633308
}
```

## Link simples para funcionario
- Link curto recomendado: `/ponto`
- `/bater-ponto` redireciona para o mesmo link
- Opcional: usar `/ponto?token=<token_do_dia>` para abrir com token ja preenchido
- A pagina publica envia a batida para `POST /api/pontos/bater`
- A localizacao e capturada automaticamente no clique de registrar ponto (sem campos manuais para latitude/longitude).
