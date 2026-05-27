# 09 - Boas Praticas de API

## O que foi implementado

- Respostas padronizadas em JSON com campos success/data/error.
- Status HTTP coerentes por tipo de falha.
- Tratamento global de erros com middleware dedicado.
- Validacao de body, query e params.
- Limite de tamanho de payload JSON.
- x-powered-by desativado para reduzir exposicao tecnica.

## Arquivos principais

- src/app.js
- src/middlewares/errorMiddleware.js
- src/middlewares/validateRequest.js
- src/utils/errors.js

## Padrao de resposta

- Sucesso: { success: true, data: ... }
- Erro: { success: false, error: { code, message, details? } }
