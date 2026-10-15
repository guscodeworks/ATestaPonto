## Repo layout

- Node.js 24, npm e CommonJS (`require`/`module.exports`).
- Em `src/`: routes definem endpoints; controllers tratam HTTP; services concentram regras; models acessam dados; middlewares protegem sessão, RBAC e escopo.

## Commands

- Em `atesta-gateway/`, `npm run dev:check` verifica a conexão com `SELECT 1`, usando a configuração real.
- `npm run mvc:check` verifica limites entre camadas MVC quando essas camadas forem alteradas.
- `npm run build:client` regenera bundles apenas quando suas fontes forem alteradas.

## Constraints

- Preserve `req.session.admin`, OAuth `state`/PKCE, callback e revalidação do cadastro administrativo e acessos ativos; dashboard exige sessão administrativa autorizada.
- Mantenha ponto separado do fluxo administrativo: preserve identificação, elegibilidade, acesso local/QR, sequência de marcações e proteção contra duplicidade.
- Reutilize o cliente Spring existente para chamadas HMAC; valide respostas internas e projete os campos públicos antes de responder ao navegador.

## Done when

- Selecione verificações conforme a mudança; antes de executar testes, confira acesso ao banco e efeitos colaterais. `npm test` não é uma etapa obrigatória.
