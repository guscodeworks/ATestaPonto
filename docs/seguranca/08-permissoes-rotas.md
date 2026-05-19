# 08 - Permissoes e Separacao de Rotas

## O que foi implementado

- Separacao entre rotas publicas, rotas de funcionario e rotas administrativas.
- Rotas admin protegidas por middleware JWT.
- Registro de ponto protegido por JWT de funcionario.
- Rotas de batida de ponto sem acesso a dados administrativos.
- Funcionario nao possui endpoint para listar outros funcionarios.

## Rotas

### Publicas

- POST /api/admin/auth/login
- GET /ponto/acessar?qr_code=<codigo>
- POST /api/pontos/validar-qr
- POST /api/pontos/login
- GET /health

### Privadas (funcionario)

- POST /api/pontos/registrar
- POST /ponto/registrar

### Privadas (admin)

- GET /api/admin/auth/me
- GET /api/admin/funcionarios
- POST /api/admin/funcionarios
- PATCH /api/admin/funcionarios/:id
- PATCH /api/admin/funcionarios/:id/status
- GET /api/admin/qr-tokens
- POST /api/admin/qr-tokens
- PATCH /api/admin/qr-tokens/:id/desativar
- POST /api/admin/qr-tokens/validar

## Arquivos principais

- src/routes/index.js
- src/routes/adminAuthRoutes.js
- src/routes/adminEmployeeRoutes.js
- src/routes/adminQrRoutes.js
- src/routes/punchRoutes.js
- src/middlewares/authMiddleware.js