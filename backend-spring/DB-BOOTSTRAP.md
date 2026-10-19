# MySQL descartável sem Node.js

Execução manual e independente do Spring. O script cria sua própria instância
MySQL 8.4, aplica o SQL canônico e mantém o banco disponível enquanto estiver
aberto. Não inicia Node.js, Spring, Redis ou simuladores.

## Executar

Requer Python 3.9+ e Docker local com containers Linux. A imagem `mysql:8.4`
precisa estar disponível localmente; a ferramenta usa `--pull=never`, sem instalar
dependências ou baixar imagens. Na raiz do repositório:

```bash
python3 backend-spring/scripts/bootstrap-db.py
```

No Windows, use `py -3 backend-spring/scripts/bootstrap-db.py` com Docker Desktop
em modo Linux. `--help` mostra a ajuda sem acessar Docker ou MySQL.

A saída informa a porta aleatória em `127.0.0.1`, o nome exclusivo do banco e o
caminho de um arquivo `database.env` no diretório temporário do sistema. Esse
arquivo contém apenas as credenciais geradas e os parâmetros do banco descartável;
a senha não é impressa. Em Linux, arquivo com modo `0600` dentro de pasta privada;
em Windows, a proteção depende das ACLs do diretório temporário do usuário.

Para usar a conexão em outro terminal Bash, carregue **o arquivo temporário
informado pelo script**, antes de iniciar manualmente seu cliente:

```bash
set -a
. /caminho/informado/database.env
set +a
```

No PowerShell, carregue explicitamente o mesmo arquivo temporário:

```powershell
Get-Content 'C:\caminho\informado\database.env' | ForEach-Object {
    $name, $value = $_ -split '=', 2
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
```

O usuário `atesta_bootstrap` tem permissões somente no banco criado. Nenhum
arquivo `.env` do repositório é lido ou alterado. As outras configurações exigidas
por uma aplicação continuam a cargo de quem a executar; este comando somente
prepara o banco.

## Baseline e migrations

- Fonte única: `atesta-gateway/database/schema/ponto.sql`, lida diretamente e
  aplicada uma vez, sem copiar suas tabelas para outro SQL.
- As 10 tabelas incluem `ponto_idempotencia`, com a mesma estrutura da migration
  `20260908_ponto_idempotencia.sql`. Essa migration **não é executada novamente**.
- O script confere os hashes do baseline e da migration e a lista de arquivos
  `.sql` em `database/migrations/` antes de criar o container. Qualquer mudança
  interrompe a execução e exige revisão desse plano; migrations futuras não são
  ignoradas nem executadas automaticamente. Os hashes normalizam BOM UTF-8 e
  finais de linha LF/CRLF para permitir checkouts Windows/Linux.
- `CREATE DATABASE` não usa `IF NOT EXISTS`: banco existente, mesmo vazio,
  resulta em erro antes de aplicar o baseline. Não há modo de reaproveitamento,
  atualização ou importação em banco existente.

## Isolamento e descarte

- Não aceita argumentos de host, porta, URL, credenciais, banco ou container.
  Ignora configurações de conexão do ambiente, inclusive `DOCKER_HOST` e
  `DOCKER_CONTEXT`; usa somente o Docker local padrão (`/var/run/docker.sock`
  em Linux ou `docker_engine` via named pipe em Windows).
- Cria um container com nome exclusivo, sem volumes ou diretórios existentes;
  `/var/lib/mysql` fica em `tmpfs` de 512 MiB, com limite de memória de 768 MiB.
- Toda inicialização SQL ocorre por socket dentro do container criado, usando
  seu ID. Somente a porta de uso posterior é publicada em `127.0.0.1`.
- Não consulta nem modifica `mysql-dev`, `node-dev`, seus volumes ou outros
  bancos. Não altera configuração, código ou inicialização do Spring.
- Ctrl+C, SIGTERM e falhas após a criação tentam remover apenas o container
  próprio, seus volumes anônimos e o arquivo de credenciais temporárias.

## Limitações e validação

Banco somente estrutural, sem usuários administrativos, cargos ou dados de
exemplo. Não substitui migrations de produção. Alterar SQL exige revisar os
hashes e a decisão sobre migrations incorporadas.

Docker remoto, contextos personalizados, Docker rootless com socket alternativo
e execução de containers Windows não são suportados. A conexão publicada atende
clientes na máquina do Docker; não configura redes para outras aplicações em
containers. Usuários com acesso ao daemon Docker conseguem inspecionar as
credenciais temporárias. Não use dados reais nesse banco.

SIGKILL, queda de energia ou perda de acesso ao Docker podem impedir a limpeza.
Nesse caso, identifique o container pela label
`atestaponto.purpose=spring-db-bootstrap` e remova **somente o ID correspondente**
com `docker rm -f -v <ID>`; remova também a pasta temporária indicada na saída.
Parar o container perde os dados em memória.

Para validar sem efeitos colaterais, execute `python3
backend-spring/scripts/bootstrap-db.py --help`. A validação integrada exige
executar o comando principal explicitamente: aguardar as 10 tabelas, conectar um
cliente usando o arquivo temporário e encerrar com Ctrl+C para conferir o
descarte. Ela cria schema apenas no MySQL descartável; não deve usar os `.env`
reais nem realizar login ou startup das aplicações para testar este script.
