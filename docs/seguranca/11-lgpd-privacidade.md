# 11 - LGPD e Privacidade

## O que foi implementado

- Tratamento de CPF e email como dados pessoais sensiveis.
- Mascaramento de CPF em respostas nao estritamente necessarias.
- Nao exposicao de senha/hash/token completo.
- Uso de campo ativo e desativado_em para desativacao logica de funcionario.
- Base pronta para trilha de auditoria com audit_logs.

## Arquivos principais

- src/controllers/adminEmployeeController.js
- src/utils/cpf.js
- src/utils/logger.js
- ponto.sql

## Direcao para evolucao

- Estrutura permite evoluir para processos de auditoria, retificacao e exclusao logica conforme politica institucional.
