# AGENTS.md — ponto-escolar

## 1. Identidade do projeto

Sistema principal de controle de ponto escolar.

Gerencia:

* dashboard administrativo;
* cadastro e validação de funcionários;
* registro de ponto;
* autenticação via Gov.br/OIDC;
* autorização interna da aplicação.

---

## 2. Regra central

**Gov.br autentica. Ponto Escolar autoriza.**

* Gov.br, ou simulador local, confirma quem é o usuário.
* Ponto Escolar decide se esse usuário tem permissão administrativa.
* Token válido **não** equivale a permissão de admin.
* A autorização é decidida internamente pelo sistema, nunca apenas pelo token.

---

## 3. Separação com `gov.br-fake`

* `gov.br-fake` é apenas simulador local. Não é produção.
* `ponto-escolar` pode consumir o simulador via variáveis de ambiente durante apresentações.
* Nenhuma lógica fake do simulador deve existir no back-end real.
* Trocar do simulador para Gov.br real deve depender principalmente de configuração e credenciais, não de reescrita da regra de negócio.

---

## 4. Arquitetura obrigatória

Padrão: **MVC com services e models/repositories.**

| Camada                    | Responsabilidade                                               |
| ------------------------- | -------------------------------------------------------------- |
| `routes`                  | Define URLs e chama controllers. Não contém regra de negócio.  |
| `controllers`             | Recebe `req`/`res`, chama services e devolve resposta HTTP.    |
| `services`                | Concentra regra de negócio, validações e integrações externas.   |
| `models`                  | Concentra SQL e acesso ao banco.                               |
| `middlewares`             | Protege rotas e valida acesso.                                 |
| `utils`                   | Funções pequenas e reutilizáveis.                              |

Regras obrigatórias:

* Controllers **não** acessam banco diretamente.
* Services concentram a lógica de negócio.
* Models/repositories concentram SQL e queries.
* Front-end não decide autenticação, autorização ou permissão.
* Usar **CommonJS** com `require` e `module.exports`, salvo se o projeto inteiro já estiver em ESM.

---

## 5. Segurança

* Nunca enviar token pela URL.
* Nunca aceitar token vindo do front-end como prova de login ou admin.
* Nunca liberar dashboard baseado apenas na existência de token.
* Nunca criar `isAdmin` fake.
* Nunca criar tela para escolher perfil `Admin` ou `Funcionário`.
* Nunca criar usuário fake no fluxo real.
* Sessão admin deve ser criada internamente após autenticação e autorização.
* Dashboard admin depende de `req.session.admin`.
* Não remover validação de `state`, PKCE ou verificação de admin.
* Secrets devem vir de `process.env`.
* Nunca salvar credenciais, tokens ou secrets no código.

---

## 6. Fluxo admin Gov.br/OIDC

Fluxo esperado:

1. Admin acessa `/admin/dashboard`.
2. Middleware verifica `req.session.admin`.
3. Sem sessão, redireciona para `/auth/govbr/login`.
4. Back-end gera `state`, `codeVerifier` e `codeChallenge`.
5. Dados temporários do OAuth ficam na sessão.
6. Usuário autentica no Gov.br ou simulador.
7. Callback valida `code`, `state`, sessão OAuth e PKCE.
8. Back-end troca `code` por token.
9. Back-end busca `/userinfo`.
10. Sistema verifica se `userInfo.sub` está autorizado como admin.
11. Se autorizado, cria `req.session.admin`.
12. Se não autorizado, retorna `403`.

Rotas esperadas:

* `/auth/govbr/login`
* `/auth/govbr/callback`
* `/auth/govbr/logout`
* `/admin/dashboard`

---

## 7. Fluxo funcionário/ponto

Fluxo esperado:

1. Funcionário acessa tela de ponto.
2. Sistema identifica o funcionário.
3. Sistema verifica se existe e está ativo.
4. Sistema valida regra de acesso, local ou QR Code.
5. Sistema verifica marcação do dia.
6. Sistema decide se é entrada, saída ou bloqueio por duplicidade.
7. Sistema registra no banco.
8. Sistema retorna confirmação clara.

Regras:

* Funcionário não acessa `/admin/dashboard`.
* Funcionário não passa pelo fluxo admin Gov.br.
* Funcionário não decide seu próprio cargo ou permissão.
* Rotas de ponto devem ficar separadas das rotas admin.

---

## 8. Regras de edição para o Codex

Antes de alterar qualquer arquivo:

1. Leia o `AGENTS.md` do workspace geral.
2. Leia este `AGENTS.md`.
3. Analise o código real existente.
4. Entenda o escopo da tarefa.
5. Faça a menor alteração possível para resolver o problema.
6. Se houver conflito entre este arquivo e o código real, explique o conflito antes de alterar.

Proibido sem pedido explícito:

* mexer no front-end;
* mexer em QR Code;
* mexer no banco de dados ou schema;
* criar estrutura nova se já existir estrutura equivalente;
* trocar CommonJS por ESM;
* criar dashboard duplicado;
* copiar lógica do `gov.br-fake` para o back-end real sem adaptação;
* refatorar arquivos fora do escopo pedido.

---

## 9. Git e testes

* Não fazer commit sem autorização explícita.
* Não fazer push sem autorização explícita.
* Quando commit for solicitado, deve ser atômico e descritivo.
* Nunca commitar `.env` com dados reais, secrets ou tokens.
* Não misturar alterações de `gov.br-fake` e `ponto-escolar` no mesmo commit.
* Testar quando possível.
* Se não for possível testar, informar o motivo e sugerir como validar manualmente.

---

## 10. Prioridade final

> **Gov.br autentica a identidade. Ponto Escolar decide a autorização.**
>
> Token válido nunca é suficiente para acesso admin.
>
> Em caso de dúvida, analise o código real antes de agir.
