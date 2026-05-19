# 04 - Seguranca do QR Code

## O que foi implementado

- QR Code aleatorio, persistido em banco somente como hash.
- Validade diaria ate a proxima meia-noite de `America/Sao_Paulo`.
- Validacao de existencia, status ativo, expiracao e unidade/local.
- QR Code usado apenas como porta de entrada; nao substitui login do funcionario.
- Endpoint de validacao com retorno de status.
- Auditoria para tentativas invalidas.

## Arquivos principais

- src/services/qrCodeService.js
- src/controllers/adminQrController.js
- src/controllers/punchController.js