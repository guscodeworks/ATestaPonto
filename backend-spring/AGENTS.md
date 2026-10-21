## Stack

- Java 21, Spring Boot 3.5.x, Maven, JDBC e MySQL.
- Redis para sessões administrativas via Spring Session, QR e controles de acesso/rate limiting existentes; preserve configuração por ambiente e não amplie fallbacks locais para produção.
- OAuth Gov.br Authorization Code com `state` e PKCE S256 para autenticação administrativa; JWT Bearer de funcionário é um fluxo separado.

## Commands

- Dentro de `backend-spring/`, `./mvnw compile` compila o projeto; use quando pertinente à mudança.
- Selecione validações locais proporcionais à alteração e confira seus efeitos antes de executá-las; login, startup ou testes que escrevam no banco exigem autorização explícita conforme a raiz. Não gere scripts ou relatórios versionados para testes locais, nem crie arquivos auxiliares não solicitados.

## Architecture

- Controller trata HTTP → Service concentra regras e transações → Repository executa SQL via JDBC, parametrizado conforme a raiz; preserve os limites transacionais existentes.
- APIs públicas, como `/api/admin/**`, `/api/pontos/**` e `/auth/govbr/**`, atendem os clientes com as proteções próprias de cada fluxo; públicas não significa acesso anônimo irrestrito, nem exige HMAC do navegador.
- `/internal/**` mantém compatibilidade Node → Spring durante a migração, com HMAC, timestamp, request ID e proteção anti-replay definidos na raiz; não crie rotas alternativas que contornem essa proteção.
- Preserve contratos HTTP públicos e internos: rotas, métodos, status, corpos, erros, cookies e redirecionamentos consumidos pelo navegador e pelo gateway.
- Preserve atomicidade, rollback, locks e revalidações de autorização dentro das transações existentes; não mova SQL para controllers.

## Security

- Gov.br autentica; o sistema autoriza. Preserve callback, consumo único do `state`, PKCE, renovação da sessão no login e revalidação do cadastro administrativo e acessos ativos na sessão Redis.
- A autorização administrativa exige capacidades e RBAC territorial por diretoria/escola conforme as políticas existentes. Falhe fechado: escopo ausente, inválido ou vazio não autoriza; acesso global exige autorização explícita. Não confie em IDs, perfis ou escopos enviados pelo navegador.
- No fluxo de funcionário, preserve assinatura e validade do JWT, perfil, versão da credencial, cadastro ativo e separação do comprovante de primeiro acesso; JWT de funcionário não concede autorização administrativa. Não envie tokens pela URL nem exponha segredos ou dados pessoais.

## Constraints

- Use o schema existente e SQL parametrizado; não introduza Hibernate/JPA, geração automática de schema, migrations ou infraestrutura sem necessidade autorizada explicitamente. Para escritas no banco, siga a exigência de autorização explícita da raiz.

## Done when

- Contratos públicos e internos, autorização territorial e garantias transacionais preservados; diff revisado e validações realizadas ou limitações informadas conforme a raiz.
- Funcionalidades implementadas ainda exigem homologação antes da produção; compilação ou testes locais não comprovam prontidão nem autorizam publicação.
