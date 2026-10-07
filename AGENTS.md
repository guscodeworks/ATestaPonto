# AGENTS.md — ATestaPonto

## Escopo e hierarquia

Estas regras se aplicam a todo o repositório. Leia também os AGENTS.md da pasta
alvo; eles acrescentam instruções específicas ao seu escopo. Instruções explícitas
do usuário prevalecem. Identifique o projeto e leia o código relevante antes de editar.

- `ponto-escolar/`: sistema principal e gateway público Node.js.
- `backend-spring/`: backend Java 21 + Spring Boot em migração gradual.
- `gov.br-fake/`: simulador técnico de autenticação; não é produção.

Não misture código, lógica ou dados do simulador com o sistema real. Alterações
em mais de um projeto devem ser necessárias ao escopo solicitado.

## Arquitetura e migração

- Migração gradual Node.js → Java 21 + Spring Boot, com Strangler Pattern.
- Node permanece gateway público e mantém sessão, autenticação administrativa,
  RBAC, escopo territorial e rate limiting durante a transição.
- Spring assume gradualmente regras, consultas e domínios migrados.
- Node → Spring usa `/internal/**` com HMAC. Frontend não chama Spring diretamente.
- Spring acessa o banco por JDBC e SQL explícito. Não introduza Hibernate/JPA
  para DDL automático nem Flyway/Liquibase sem solicitação explícita.
- Preserve contratos existentes e a estrutura do projeto durante a migração.
- Controller trata HTTP, sem SQL ou regra de negócio. Service contém regras e
  orquestração. Repository contém acesso ao banco; no Node, models existentes
  cumprem essa responsabilidade.
- Evite abstrações genéricas prematuras. Aplique YAGNI e mudanças pequenas.

## Banco de dados

- Nunca crie, altere ou exclua tabelas ou dados sem autorização explícita.
- Validações são somente leitura por padrão. Não execute INSERT, UPDATE, DELETE
  ou DDL apenas para testar, inclusive por login ou startup com efeitos de escrita.
- Use o schema existente. Não crie migrations sem solicitação explícita.
- Queries devem ser parametrizadas; não concatene valores recebidos em SQL.

## Portabilidade

- Preserve compatibilidade com Windows, Linux e Docker.
- Não hardcode caminhos de máquina (`/home/...`, `C:\...`), hostname de container,
  `127.0.0.1` ou `localhost` como regra da aplicação.
- Hosts, portas, URLs e credenciais vêm de configuração/variáveis de ambiente.
- Não use comandos exclusivos de Bash ou PowerShell nos fluxos do projeto.
  Prefira APIs multiplataforma Node/Java para caminhos e processos.
- Docker é suportado, mas não é requisito implícito para execução nativa.
- `DB_HOST` é o endereço alcançável pelo processo: execução nativa Windows/Linux
  usa o endereço configurado no ambiente/.env; containers na mesma Docker network
  podem usar DNS do serviço/container; produção usa o hostname do provedor.
- Nunca implemente fallback automático entre host local e hostname Docker.

## Desenvolvimento paralelo

- Evite modificar domínios trabalhados por outro colaborador; prefira módulos isolados.
- Não refatore arquivos compartilhados sem necessidade. Antes de alterar
  infraestrutura compartilhada, verifique impacto nos outros domínios.
- Não mova, renomeie, troque dependências, frameworks ou arquitetura fora do escopo.

## Segurança

- Autorização permanece fail-closed: escopo ausente ou inválido nunca significa global.
  Escopo vazio não autoriza recursos; global deve ser explícito e autorizado.
- Gov.br autentica; o sistema principal autoriza. Token válido não implica admin.
- Não confie em IDs do navegador como prova de autorização. Frontend não decide RBAC.
- Não envie tokens pela URL nem aceite token do frontend como prova de sessão admin.
- Não hardcode credenciais nem exponha senhas, tokens, chaves ou dados pessoais
  desnecessários em código, logs, documentação ou commits.
- Preserve HMAC, timestamp, request ID e anti-replay das chamadas internas.

## Testes, documentação e artefatos

- Não crie novos testes automatizados salvo solicitação explícita.
- Não crie mocks, fixtures ou scripts temporários permanentes.
- Não deixe logs, dumps ou arquivos de diagnóstico no repositório.
- Não crie `.md` dentro de `src/`. Documentação fica em README, `docs/` ou
  AGENTS.md apropriado fora de `src/`.
- Preserve testes históricos e arquivos fora do escopo. Não versione `.env` real,
  credenciais, dependências instaladas ou artefatos de build como `target/`.

## Git e forma de trabalho

- Não faça commit ou push sem instrução explícita; não misture alterações fora do escopo.
- Quando solicitados, commits devem ser pequenos, descritivos e logicamente separados.
- Verifique branch e status antes de alterações relevantes; preserve trabalho local alheio.
- Execute mudanças incrementalmente. Não amplie o escopo nem repita auditorias
  ou revisões sem necessidade.
- Se for necessária alteração de banco, arquitetura ou segurança fora do escopo,
  pare e reporte antes de modificar.
- Revise o diff e execute validações pertinentes autorizadas. Não crie testes por
  iniciativa própria; informe o que foi validado e as limitações.
- Ao finalizar, liste arquivos alterados e explique de forma curta o resultado,
  riscos e pendências. Não afirme funcionamento que não foi validado.
