# 02 - Protecao Contra Ataques Comuns

## O que foi implementado

- Helmet habilitado para headers de seguranca.
- Rate limit global e rate limits especificos para login, rotas sensiveis e ponto.
- CORS restritivo com allowlist definida por CORS_ORIGIN.
- Validacao e sanitizacao de entrada com express-validator.
- Queries parametrizadas com mysql2 (execute com placeholders).

## Arquivos principais

- src/app.js
- src/middlewares/rateLimiters.js
- src/middlewares/validators.js
- src/middlewares/validateRequest.js
- src/config/database.js

## Risco mitigado

- Forca bruta em login e endpoints criticos.
- Entrada malformada e tentativa de injetar payload inesperado.
- SQL injection por concatenacao de string.
- Exposicao indevida por CORS aberto em producao.
