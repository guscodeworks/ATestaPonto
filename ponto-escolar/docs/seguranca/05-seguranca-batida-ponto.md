# 05 - Seguranca na Batida de Ponto

## O que foi implementado

- Validacao de sessao autenticada do funcionario.
- Validacao do QR Code vinculado a sessao.
- Login do funcionario com senha hash bcrypt antes da batida.
- Validacao de latitude e longitude.
- Verificacao de raio permitido com Haversine.
- Verificacao de funcionario ativo.
- Limite de 4 batidas por dia.
- Controle de sequencia da batida (1 a 4).
- Transacao no banco para garantir integridade.
- Constraint unica para evitar duplicidade por funcionario/data/sequencia e funcionario/data/tipo.

## Arquivos principais

- src/controllers/punchController.js
- src/services/qrCodeService.js
- src/middlewares/authMiddleware.js
- src/utils/location.js
- src/middlewares/validators.js
- database/schema/ponto.sql

## Integridade e concorrencia

- Operacao feita em transacao unica.
- SELECT ... FOR UPDATE em registros criticos do fluxo.
- Falha de duplicidade tratada com resposta adequada.
