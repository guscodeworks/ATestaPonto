# Correção — primeiro login e troca obrigatória de senha

## Problema encontrado

Funcionários que já haviam concluído a troca de senha podiam continuar sendo direcionados para a tela de nova senha. Isso também fazia parecer que a atualização não havia sido concluída, embora a rota de atualização já gravasse o hash e alterasse o indicador de primeiro acesso na mesma transação.

## Causa

O backend tratava `primeiro_acesso` usando a conversão genérica de JavaScript (`if (valor)`). Quando o banco ou o driver retorna o campo como texto, o valor persistido `"0"` é considerado verdadeiro em JavaScript. Como consequência, um funcionário com primeiro acesso concluído podia ser reconhecido indevidamente como pendente.

## Arquivos alterados

- `src/utils/firstAccess.js`
- `src/services/punchService.js`
- `src/middlewares/authMiddleware.js`
- `test/firstAccessPassword.test.js`

## Correções realizadas

- Centralizada a interpretação do estado persistido: somente `true`, `1` e `"1"` significam primeiro acesso pendente.
- O login só emite a credencial temporária e exige a troca quando esse estado estiver pendente.
- A rota de troca confirma o mesmo estado antes de permitir a alteração.
- A atualização já existente continua sendo transacional: gera o hash com `bcrypt`, atualiza `senha_hash`, limpa a expiração da senha temporária e grava `primeiro_acesso = FALSE`.

## Fluxo atual

1. O login verifica a senha com `bcrypt.compare` e consulta o estado persistido.
2. Se `primeiro_acesso` for `1`, emite exclusivamente a credencial temporária para `/api/pontos/alterar-senha`.
3. A rota valida essa credencial, bloqueia o registro do login e grava o novo hash com `bcrypt.hash` na mesma transação que conclui o primeiro acesso.
4. Nos próximos logins, `primeiro_acesso = 0` gera o token normal de funcionário; a senha temporária deixa de validar e a nova senha passa a ser a única aceita.

## Testes realizados

O teste `test/firstAccessPassword.test.js` cobre:

- primeiro login com troca obrigatória;
- persistência do novo hash e invalidação da senha temporária;
- conclusão do indicador de primeiro acesso;
- autorização da rota de troca antes da alteração e bloqueio da reutilização da credencial após a conclusão;
- login posterior com token normal, sem retorno à tela de troca;
- comportamento correto para o valor persistido `"0"` (login normal);
- rejeição da senha antiga.

Resultado: `npm test` foi executado com sucesso (1 teste aprovado). O teste simula a persistência do repositório e confirma o hash novo, o estado concluído e a rejeição da senha antiga. A conexão direta ao banco não foi executada porque este checkout não possui `.env` com a configuração do banco; a SQL revisada atualiza `senha_hash` e `primeiro_acesso` na mesma transação. A verificação geral de MVC possui falhas pré-existentes e fora deste escopo, em outros arquivos.
