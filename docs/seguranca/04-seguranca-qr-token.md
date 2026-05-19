# 04 - Seguranca do QR Token

## O que foi implementado

- Token diario deterministico por data de `America/Sao_Paulo`.
- Rotacao automatica na virada do dia (00:00 horario de Brasilia).
- Validacao em memoria (sem necessidade de consulta na tabela de tokens).
- Comparacao em tempo constante (`timingSafeEqual`) para reduzir risco de side channel.
- Endpoint de validacao com retorno de status (`valido` ou `invalido`).
- Auditoria para tentativas invalidas.

## Arquivos principais

- src/services/dailyQrTokenService.js
- src/controllers/adminQrController.js
- src/controllers/punchController.js
