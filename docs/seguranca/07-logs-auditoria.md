# 07 - Logs e Auditoria

## O que foi implementado

- Estrutura de auditoria em banco na tabela audit_logs.
- Registro de eventos criticos como login admin, cadastro e alteracao de funcionario, geracao e validacao de QR, tentativas invalidas e batida de ponto.
- Sanitizacao de metadados para evitar vazamento de senha, token e dados indevidos.

## Arquivos principais

- src/services/auditLogService.js
- src/utils/logger.js
- ponto.sql

## Eventos cobertos

- admin_login_sucesso
- admin_login_invalido
- funcionario_cadastrado
- funcionario_alterado
- funcionario_ativado
- funcionario_desativado
- qr_token_gerado
- qr_token_desativado
- tentativa_qr_invalido
- batida_ponto_realizada
- tentativa_fora_localizacao
- tentativa_cpf_inexistente
