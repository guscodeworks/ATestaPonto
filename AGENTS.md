## Repo layout
- `atesta-gateway/`: sistema principal e gateway público Node.js.
- `backend-spring/`: Java 21 + Spring Boot, com JDBC e SQL explícito.
- `atesta-id/`: simulador ATestaID isolado, fora de produção; não misture código, regras ou dados com o sistema real.

## Architecture
- Migre Node → Spring gradualmente pelo Strangler Pattern, preservando contratos e camadas existentes.
- Node mantém sessão, autenticação administrativa, RBAC, escopo territorial e rate limiting; frontend não chama Spring diretamente.
- Node → Spring usa `/internal/**` com HMAC; preserve timestamp, request ID e proteção anti-replay.

## Constraints
- Autorização fail-closed: escopo ausente, inválido ou vazio não autoriza; acesso global exige autorização explícita. Gov.br autentica; o sistema autoriza; IDs ou tokens do navegador não bastam para conceder acesso.
- Proteja o MySQL: use queries parametrizadas e o schema existente; escritas em dados/schema e testes com efeitos colaterais (inclusive login/startup) exigem autorização explícita. Validações são somente leitura por padrão.
- Não exponha segredos ou dados pessoais nem envie tokens pela URL; configuração sensível vem do ambiente, sem credenciais no código ou Git.
- Estas regras valem para todo o repo; AGENTS.md dos módulos as complementam, e instruções explícitas do usuário prevalecem. Leia o código relevante e as regras locais; confira branch/status, faça a menor mudança no escopo e preserve alterações de colaboradores, arquivos não rastreados e processos. Não crie worktrees sem solicitação explícita.
- Commits e publicação (incluindo push/deploy) exigem autorização explícita; não troque arquitetura, dependências ou infraestrutura fora do escopo. Preserve compatibilidade Windows/Linux/Docker e configuração por ambiente.

## Done when
- Escopo atendido e diff revisado; execute validações pertinentes e autorizadas quando aplicáveis, sem criar novos testes automatizados salvo solicitação explícita.
- Informe arquivos alterados, resultado, validações realizadas ou motivo de não executá-las, riscos e pendências; não afirme funcionamento não validado.
