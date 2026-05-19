# 03 - Seguranca dos Dados

## O que foi implementado

- CPF tratado como dado sensivel, mascarado em respostas de listagem.
- Nao retorno de hash de senha em respostas da API.
- Padrao de erro com mensagem controlada ao cliente.
- Middleware global de erro sem stack trace em producao.
- Sanitizacao de campos sensiveis em logs.

## Arquivos principais

- src/controllers/adminEmployeeController.js
- src/middlewares/errorMiddleware.js
- src/utils/cpf.js
- src/utils/logger.js
- src/utils/errors.js

## Regras aplicadas

- Apenas dados necessarios sao retornados em cada endpoint.
- Erros internos nao expostos ao usuario final.
