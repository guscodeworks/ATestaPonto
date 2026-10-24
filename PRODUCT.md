# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Funcionário escolar:** registra o ponto na própria unidade escolar. A batida acontece tanto no celular pessoal quanto em tablet ou computador compartilhado da escola, então várias pessoas podem usar o mesmo aparelho em sequência. Também consulta o próprio perfil e relatório de batidas, troca a senha no primeiro acesso e recupera a senha.
- **Administradores:** gerenciam escolas, funcionários, acessos, QR Codes e relatórios conforme o perfil e o escopo territorial: ADMIN_SEDUC (estadual), ADMIN_DIRETORIA (uma Diretoria de Ensino) e DIRETOR, VICE_DIRETOR, SECRETARIA e COORDENADOR (uma unidade escolar).

## Product Purpose

Controlar a presença de funcionários em escolas, comprovando que a pessoa estava fisicamente na unidade no momento da batida. O sucesso é um registro diário confiável (entrada, saída para almoço, retorno do almoço e saída) que cada nível administrativo consulta dentro do seu escopo.

## Positioning

A batida combina três provas: login do funcionário, leitura do QR Code da unidade escolar e geolocalização dentro do raio permitido pela escola. A administração entra pelo Gov.br, mas a autorização vem do próprio sistema, por perfil e escopo territorial (estado, DRE ou escola).

## Operating Context

- Projeto acadêmico (TCC) de uma equipe de cinco desenvolvedores, pensado para uma secretaria estadual de educação. Ainda não há cliente real nem uso em produção.
- O funcionário usa o sistema na escola, com pouco tempo e muitas vezes em aparelho compartilhado. A sessão de uma pessoa não pode ficar disponível para a próxima.
- Os administradores trabalham em painéis de cadastro, listas e relatórios diários, semanais e hierárquicos.
- Em desenvolvimento, o Gov.br é simulado pelo ATestaID (`atesta-id/`), que nunca vai para produção.

## Capabilities and Constraints

- Interface em português do Brasil (`lang="pt-BR"`), servida como HTML, CSS e JavaScript de navegador. O backend migra de Node/Express para Spring Boot sem reescrever o frontend.
- Tipos de batida derivados da sequência do dia: Entrada, Saída para almoço, Retorno do almoço e Saída.
- Cadastro de escola com CEP e coordenadas pela BrasilAPI. O cadastro de funcionário gera uma senha temporária, mostrada uma única vez ao administrador.
- Autorização fail-closed: escopo ausente, inválido ou vazio não dá acesso. Tokens não vão na URL, e dados pessoais não ficam expostos.
- Decisões em aberto: padrão de acessibilidade obrigatório e conformidade com a identidade gov.br não foram definidos.

## Brand Commitments

- Nome: **ATestaPonto**. Identidade própria, independente da identidade visual de governo.
- A expressão visual dessa identidade ainda não está registrada em um DESIGN.md.

## Evidence on Hand

- Telas existentes em `atesta-gateway/views/` (funcionário, administração, senha e erro) e assets em `atesta-gateway/public/` (CSS com `tokens.css`, ícones SVG e imagens).
- Não há usuários reais, depoimentos, métricas de uso nem escolas em produção. Nada disso deve ser inventado.

## Product Principles

1. Presença comprovada: cada batida precisa resistir à dúvida de que a pessoa estava na escola.
2. Bater o ponto deve ser rápido e inequívoco, inclusive em aparelho compartilhado e com pressa.
3. Cada administrador vê e altera só o que o seu escopo permite, e a interface não sugere acesso que o backend negaria.
4. Os dados pessoais dos funcionários são tratados como sensíveis em toda tela, mensagem e relatório.
