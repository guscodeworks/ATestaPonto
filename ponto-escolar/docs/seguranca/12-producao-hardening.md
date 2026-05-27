# 12 - Preparacao para Producao

## O que foi implementado

- CORS restritivo configurado por ambiente.
- Validacao de JWT_SECRET forte.
- Tratamento de erro sem vazamento de detalhe interno em producao.
- Helmet ativo.
- Rate limiting ativo para reduzir abuso.
- Rotas administrativas sempre autenticadas.

## Arquivos principais

- src/config/env.js
- src/app.js
- src/middlewares/authMiddleware.js
- src/middlewares/errorMiddleware.js

## Checklist de deploy

- Configurar .env com segredo forte e origem CORS real.
- Executar npm run db:init no ambiente correto.
- Criar admin inicial com npm run admin:create.
- Garantir TLS/HTTPS no reverse proxy.
- Monitorar tabela audit_logs.
