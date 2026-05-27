# 01 - Autenticacao Segura

## O que foi implementado

- Login de administrador com JWT.
- Senha de admin armazenada somente como hash bcrypt.
- Middleware de autenticacao para rotas privadas de admin.
- Validacao de token em todas as rotas protegidas.
- Bloqueio de acesso quando admin estiver inativo.

## Arquivos principais

- src/controllers/adminAuthController.js
- src/middlewares/authMiddleware.js
- src/routes/adminAuthRoutes.js
- src/config/env.js

## Regras aplicadas

- Nunca retornar senha_hash.
- Token JWT emitido com expiracao configuravel por JWT_EXPIRES_IN.
- JWT_SECRET obrigatorio e validado contra secret fraco.
