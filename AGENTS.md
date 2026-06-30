# AGENTS.md — Workspace Geral

## Projetos neste workspace

| Projeto         | Papel                                                          |
| --------------- | -------------------------------------------------------------- |
| `gov.br-fake`   | Simulador técnico local do Gov.br/Login Único. Não é produção. |
| `ponto-escolar` | Sistema principal de controle de ponto escolar.                |

---

## Regra de ouro antes de qualquer ação

1. Identifique em qual pasta você está trabalhando.
2. Leia o `AGENTS.md` interno da pasta do projeto antes de alterar qualquer arquivo.
3. Se não houver `AGENTS.md` interno, aplique as regras deste arquivo.
4. Respeite o escopo pedido. Não refatore, mova ou renomeie arquivos sem necessidade clara.

---

## Isolamento entre projetos

* Nunca misture código, lógica ou dados de `gov.br-fake` dentro de `ponto-escolar`, e vice-versa.
* Cada projeto tem seu próprio contexto, dependências e regras internas.
* Não altere arquivos dos dois projetos na mesma tarefa, salvo pedido explícito.

---

## Arquitetura de autenticação e autorização

* **Gov.br ou simulador autentica:** confirma a identidade do usuário.
* **Ponto Escolar autoriza:** decide se o usuário tem permissão administrativa.
* Token válido **não** implica permissão de admin.
* A permissão de admin é decidida internamente pelo `ponto-escolar`, nunca apenas pelo token.

---

## Regras de segurança

* Nunca envie token pela URL.
* Nunca aceite token vindo do front-end como prova de login.
* Nunca libere dashboard apenas pela existência de um token.
* Nunca coloque lógica fake de perfil `Admin/Funcionário` dentro do sistema real.
* Nunca exponha credenciais, secrets, tokens ou chaves em código, logs ou commits.
* Variáveis sensíveis devem vir de `.env` ou configuração segura equivalente.

---

## Regras de Git

* Não faça commit sem autorização explícita.
* Não faça push sem autorização explícita.
* Commits, quando solicitados, devem ser atômicos e descritivos.
* Nunca faça commit de `.env` com dados reais, tokens, secrets ou credenciais.
* Não altere arquivos de outro projeto no mesmo commit.
* Antes de mudanças grandes, sugira verificar `git status` e a branch atual.

---

## Fluxo de edição

1. Leia o `AGENTS.md` do projeto-alvo.
2. Entenda o escopo da tarefa.
3. Liste os arquivos relevantes antes de alterar.
4. Faça a alteração mínima necessária.
5. Teste ou indique como testar, quando possível.
6. Revise se o isolamento entre projetos foi respeitado.
7. Ao final, informe arquivos alterados e resumo técnico curto.

---

## Sobre o `gov.br-fake`

Existe para simular a integração com Gov.br/Login Único enquanto não há credenciais oficiais.

É usado para apresentação, estudo e demonstração técnica.

Nunca deve vazar lógica fake para o `ponto-escolar`.

---

## Sobre o `ponto-escolar`

Projeto principal e real.

Deve estar preparado para usar o Gov.br real no futuro.

Durante demonstrações, pode consumir o `gov.br-fake` como simulador, mas essa dependência é de apresentação, não de produção.
