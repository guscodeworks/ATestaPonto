## Repo layout
- `atesta-gateway/`: aplicação Java 21/Spring Boot, JDBC e SQL explícito; Maven inclui frontend e assets de `web/` no JAR.
- `atesta-id/`: simulador ATestaID isolado apenas para desenvolvimento e testes locais, fora de produção; preserve-o sem misturar código, regras ou dados com o sistema real.

## Architecture
- A aplicação principal executa exclusivamente no Spring. Preserve contratos, camadas e frontend; não reintroduza um runtime Node para backend ou build.
- Spring já implementa APIs públicas, OAuth Authorization Code com PKCE, sessões administrativas Redis, RBAC, escopo territorial, rate limiting, funcionários, QR, ponto e relatórios. Preserve autenticação e autorização no backend também nas rotas públicas.
- `/internal/**` com HMAC permanece para compatibilidade de integrações assinadas; preserve timestamp, request ID e proteção anti-replay. Não exija essa passagem para APIs públicas já implementadas no Spring.
- Páginas e assets são mantidos em `atesta-gateway/web/` e empacotados pelo Maven. Preserve o JavaScript do navegador e seus contratos com as APIs.

## Constraints
- Autorização fail-closed: escopo ausente, inválido ou vazio não autoriza; acesso global exige autorização explícita. Gov.br autentica; o sistema autoriza; IDs ou tokens do navegador não bastam para conceder acesso.
- Proteja o MySQL: use queries parametrizadas e o schema existente; escritas em dados/schema e testes com efeitos colaterais (inclusive login/startup) exigem autorização explícita. Validações são somente leitura por padrão.
- Não exponha segredos ou dados pessoais nem envie tokens pela URL; configuração sensível vem do ambiente, sem credenciais no código ou Git.
- Estas regras valem para todo o repo; AGENTS.md dos módulos as complementam, e instruções explícitas do usuário prevalecem. Leia o código relevante e as regras locais; confira branch/status, faça a menor mudança no escopo e preserve alterações de colaboradores, arquivos não rastreados e processos. Não crie worktrees sem solicitação explícita.
- Commits e publicação (incluindo push/deploy) exigem autorização explícita; não troque arquitetura, dependências ou infraestrutura fora do escopo. Preserve compatibilidade Windows/Linux/Docker e configuração por ambiente.
- Escreva somente código necessário à produção para atender ao escopo, ressalvadas mudanças explicitamente solicitadas no simulador local de desenvolvimento; reutilize as soluções existentes, sem abstrações ou funcionalidades especulativas. Não crie arquivos auxiliares não solicitados, incluindo scripts, documentação, relatórios ou artefatos de validação.

## Done when
- Escopo atendido e diff revisado; execute validações proporcionais ao risco e à mudança, pertinentes e autorizadas, priorizando verificações existentes e sem efeitos colaterais. Não crie novos testes automatizados salvo solicitação explícita.
- Informe arquivos alterados, resultado, validações realizadas ou motivo de não executá-las, riscos e pendências; não afirme funcionamento não validado.
- Implementado não significa homologado: funcionalidades migradas exigem homologação antes da produção; registre o que foi validado e o que permanece pendente, sem inferir aprovação pela presença de código ou compilação.
