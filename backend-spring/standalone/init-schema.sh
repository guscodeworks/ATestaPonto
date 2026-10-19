#!/bin/sh
set -eu

: "${DB_NAME:?Configure DB_NAME}"
: "${DB_USER:?Configure DB_USER}"
: "${MYSQL_PWD:?Configure DB_PASSWORD no Compose}"

if [ ! -s /schema/ponto.sql ]; then
    echo "Schema canonico ausente ou vazio; nenhuma tabela foi criada." >&2
    exit 1
fi

mysql_client() {
    mysql --no-defaults --protocol=TCP --host=mysql --port=3306 \
        --user="$DB_USER" --database="$DB_NAME" --default-character-set=utf8mb4 \
        --batch --skip-column-names --skip-reconnect "$@"
}

# shortcut: verificacao sem lock; coordenar sessoes se houver escritores concorrentes.
tables=$(mysql_client --execute='SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()')
if [ "$tables" != "0" ]; then
    echo "Inicializacao recusada: o banco ja contem tabelas ou views, inclusive de uma tentativa parcial." >&2
    exit 1
fi

# DDL MySQL nao tem rollback: uma falha parcial deve impedir novas tentativas.
if ! mysql_client < /schema/ponto.sql; then
    echo "Falha ao aplicar o schema; pode haver tabelas parciais. Nao tente reaplicar sem revisao manual." >&2
    exit 1
fi

echo "Schema canonico aplicado. Nenhuma migration ou seed foi executado."
