# backend-spring

Serviço Java 21 / Spring Boot / Maven, na porta **8081**. O navegador chama a API
Node; o Node aplica sessão, RBAC e escopo antes de acessar `/internal/**` no Spring.

## Configuração Node → Spring

| Variável | Configuração |
| --- | --- |
| `INTERNAL_API_SHARED_KEY` | Mesma chave privada no Node e no Spring, com pelo menos 32 bytes UTF-8. Sem valor padrão. |
| `SPRING_BACKEND_URL` | Somente no Node: origem do Spring, sem credenciais, query ou caminho de endpoint. Padrão local: `http://127.0.0.1:8081`. |

Os `.env.example` contêm placeholders vazios para a chave. Fornecer o valor pelo
ambiente ou gerenciador de segredos, distinto para cada ambiente e compartilhado
pelos dois processos daquele ambiente. Nunca versionar `.env` reais, registrar a
chave em logs ou enviá-la ao frontend.

- **Ambos no host:** usar `http://127.0.0.1:8081` no Node.
- **Containers na mesma rede:** usar o DNS do serviço Spring, por exemplo
  `http://backend-spring:8081`.
- **Node em container e Spring no host:** usar o endereço do host acessível pelo
  container. `host.docker.internal` exige configuração correspondente, especialmente
  em Linux; `127.0.0.1` aponta para o próprio container.
- **Homologação/produção:** definir explicitamente a origem privada do Spring e
  injetar a mesma chave nos dois serviços. Restringir acesso pela rede e proteger
  o transporte com TLS ou equivalente; HMAC não cifra o conteúdo.

## Inicialização

Com JDK 21 no host, a partir de `ponto-escolar`:

```bash
npm run dev:spring
```

Esse comando carrega `ponto-escolar/.env`, respeita variáveis já exportadas e
repassa o ambiente ao Spring. **Não carrega `backend-spring/.env`.** Se `DB_HOST`
for `mysql-dev`, o launcher usa `127.0.0.1` para o Spring no host; a porta do MySQL
precisa estar publicada.

Para iniciar separadamente, exportar `INTERNAL_API_SHARED_KEY` e as variáveis
JDBC `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, então executar:

```bash
cd backend-spring
./mvnw spring-boot:run
```

Spring/Maven não carregam `.env` automaticamente. Reiniciar os processos após
alterar sua configuração. Não há inicialização SQL ou migrations automáticas;
consultas usam conexões read-only e apenas a transação de criação habilita escrita.

## Autenticação e anti-replay

O cliente Node assina os bytes enviados com **HMAC-SHA256**. A mensagem canônica é:

```text
MÉTODO
PATH_E_QUERY_RAW
TIMESTAMP
REQUEST_ID
SHA256_DO_BODY
```

- `X-Internal-Timestamp`: timestamp Unix em segundos; janela atual de ±60 segundos.
  Os relógios dos dois processos precisam estar sincronizados.
- `X-Internal-Request-Id`: UUID novo por chamada, incluído na assinatura.
- `X-Internal-Signature`: assinatura HMAC, comparada com segurança pelo Spring.
- O filtro protege `/internal/**` antes dos controllers e rejeita chamadas sem
  assinatura válida, timestamp fora da janela ou request ID reutilizado com 401.
- O cache anti-replay é limitado, tem expiração e limpeza automática, e pertence
  a cada instância Spring. Reinícios e múltiplas instâncias não compartilham o cache.
- Sem chave válida, o Node bloqueia chamadas internas; o Spring não inicia.
- O cliente aceita somente `/internal/**` e cria seus próprios headers internos.
  Headers do navegador não são reutilizados.

Request ID e hash do body protegem a autenticação. Não representam idempotência
de criação: não há `Idempotency-Key` ou recuperação persistente nesse fluxo.

## Health

`GET /health` é público, sem assinatura, e informa o estado do serviço e da
conexão MySQL usando somente `SELECT 1`.

```bash
curl http://127.0.0.1:8081/health
```

O cliente interno Node permanece restrito a `/internal/**`; a verificação de health
é realizada separadamente. O navegador não deve chamar o Spring diretamente.
