## Stack

- Java 21, Spring Boot 3.5.x, Maven, JDBC e MySQL.

## Commands

- Dentro de `backend-spring/`, `./mvnw compile` compila o projeto; use quando pertinente à mudança.

## Architecture

- Controller trata HTTP → Service concentra regras e transações → Repository executa SQL via JDBC, parametrizado conforme a raiz; preserve os limites transacionais existentes.
- Aplique aos endpoints `/internal/**` a autenticação Node → Spring definida na raiz; não crie rotas alternativas que contornem essa proteção.

## Constraints

- Não introduza Hibernate/JPA, geração automática de schema ou migrations sem solicitação; para escritas no banco, siga a exigência de autorização explícita da raiz.

## Done when

- Respostas internas continuam compatíveis com os consumidores do gateway; operações do domínio mantêm atomicidade e rollback existentes.
