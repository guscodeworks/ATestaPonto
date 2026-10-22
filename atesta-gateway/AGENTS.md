## Repo layout

- Backend legado transitório em Node.js 24/Express, npm e CommonJS (`require`/`module.exports`); o backend de destino é Java 21/Spring Boot, conforme a raiz.
- Em `src/`: routes definem endpoints; controllers tratam HTTP; services concentram regras; models acessam dados; middlewares protegem sessão, RBAC e escopo.
- `server.js` e `src/scripts/` executam no Node para servidor e ferramentas; `public/assets/js/` contém JavaScript do navegador, incluindo fontes em `modules/` e bundles. Preserve esse frontend e seus contratos durante a migração do backend.

## Commands

- Em `atesta-gateway/`, `npm run dev:check` verifica a conexão com `SELECT 1`, usando a configuração real.
- `npm run build:client` regenera bundles apenas quando suas fontes forem alteradas.

## Constraints

- Não implemente novas funcionalidades no Express quando já houver equivalente no Spring; direcione novas regras de backend ao Spring e limite mudanças no legado à manutenção e compatibilidade necessárias.
- Enquanto houver consumidores ativos, preserve contratos HTTP, páginas, assets, cookies, redirecionamentos, validações e proteções de segurança do gateway, incluindo rate limiting, RBAC territorial e autorização com falha fechada.
- Preserve `req.session.admin`, OAuth `state`/PKCE, callback e revalidação do cadastro administrativo e acessos ativos; dashboard exige sessão administrativa autorizada.
- Mantenha ponto separado do fluxo administrativo: preserve identificação, elegibilidade, acesso local/QR, sequência de marcações e proteção contra duplicidade.
- Reutilize o cliente Spring existente para chamadas HMAC; valide respostas internas e projete os campos públicos antes de responder ao navegador.
- Não remova controllers, serviços, rotas ou ferramentas sem comprovar a substituição e a ausência de dependências ativas, incluindo consumidores, imports, scripts npm e fluxos de build/deploy. A existência de equivalente no Spring, isoladamente, não comprova que o legado possa ser removido.
- Evite testes redundantes e reutilize verificações existentes; não crie novos scripts auxiliares, relatórios ou documentação adicional sem solicitação explícita.

## Done when

- Selecione verificações proporcionais à mudança e ao risco; antes de executar testes, confira acesso ao banco e efeitos colaterais conforme a raiz. `npm test` não é uma etapa obrigatória; não regenere bundles sem alteração nas fontes.
