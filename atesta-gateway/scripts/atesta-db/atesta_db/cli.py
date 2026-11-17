"""Ponto de entrada da CLI atesta-db.

Uso: atesta-db init [--confirm-production]
Instalação única na raiz do repositório: pipx install -e ./atesta-gateway/scripts/atesta-db
"""

from __future__ import annotations

import argparse
import sys
import ssl
from pathlib import Path

import pymysql

from .config import ConfigError, DbConfig, find_repo_root, load_config
from .schema import SCHEMA_RELATIVE_PATH, SchemaError, load_schema_sql, resolve_schema_path, split_statements

PROGRAM = "atesta-db"

# Lista explícita de migrations permitidas (ID -> caminho relativo à raiz do repo)
ALLOWED_MIGRATIONS = {
    "20260908_ponto_idempotencia": "database/migrations/20260908_ponto_idempotencia.sql",
}


def fail(message: str) -> None:
    print(f"{PROGRAM}: erro: {message}", file=sys.stderr)
    raise SystemExit(1)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROGRAM,
        description="Gerencia o banco de dados do ATestaPonto: inicialização com baseline canônico "
        "(database/schema/ponto.sql) e aplicação de migrations autorizadas.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    init = subparsers.add_parser(
        "init",
        help="Cria o banco (se faltar) e aplica o baseline em banco vazio.",
        description="Cria o banco (se faltar) e aplica o baseline canônico. "
        "Aborta se o banco já contiver tabelas ou views.",
    )
    init.add_argument(
        "--confirm-production",
        action="store_true",
        help="Confirma a inicialização quando NODE_ENV=production.",
    )

    apply = subparsers.add_parser(
        "apply",
        help="Aplica uma migration autorizada explicitamente.",
        description="Aplica uma migration específica pelo ID. "
        "Somente migrations na lista autorizada são permitidas; "
        "não aceita caminhos arbitrários.",
    )
    apply.add_argument(
        "--migration",
        required=True,
        choices=sorted(ALLOWED_MIGRATIONS.keys()),
        help="ID da migration a ser aplicada (ex.: 20260908_ponto_idempotencia).",
    )
    apply.add_argument(
        "--confirm-production",
        action="store_true",
        help="Confirma a execução quando NODE_ENV=production.",
    )

    subparsers.add_parser("check", help="Verifica a conexão usando somente SELECT 1.")
    return parser


def check_production_gate(config: DbConfig, confirm_production: bool) -> None:
    if config.is_production and not confirm_production:
        fail(
            "NODE_ENV=production: é obrigatório passar --confirm-production "
            "para executar SQL em produção."
        )


def connect(config: DbConfig, *, select_database: bool = True):
    tls = ssl.create_default_context(cadata=config.ssl_ca) if config.ssl_ca else None
    return pymysql.connect(
        host=config.host, port=config.port, user=config.user, password=config.password,
        database=config.database if select_database else None,
        charset="utf8mb4", autocommit=True, ssl=tls,
        connect_timeout=5, read_timeout=30, write_timeout=30,
    )


def init_database(config: DbConfig, schema_sql: str) -> None:
    statements = split_statements(schema_sql)
    connection = None
    try:
        connection = connect(config, select_database=False)
        with connection.cursor() as cursor:
            # Cria o banco caso não exista; nome validado como seguro.
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{config.database}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
            cursor.execute(f"USE `{config.database}`")
            cursor.execute(
                "SELECT TABLE_NAME FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA = %s LIMIT 1",
                (config.database,),
            )
            existing = cursor.fetchone()
            if existing:
                fail(
                    "Inicialização interrompida: o banco de destino já contém tabelas ou views. "
                    "O baseline exige um banco vazio e não foi executado. "
                    "Para atualizar a estrutura, use as migrations apropriadas."
                )
            for statement in statements:
                cursor.execute(statement)
            connection.commit()
    except pymysql.MySQLError:
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                pass
        raise
    finally:
        if connection is not None:
            connection.close()


def run_init(confirm_production: bool) -> None:
    try:
        repo_root = find_repo_root()
        config = load_config(repo_root)
        schema_path = resolve_schema_path(repo_root)
        schema_sql = load_schema_sql(schema_path)
        check_production_gate(config, confirm_production)
    except ConfigError as error:
        fail(str(error))
    except SchemaError as error:
        fail(str(error))

    print(f"Alvo: {config.user}@{config.host}:{config.port} banco `{config.database}`")
    print(f"Baseline: {SCHEMA_RELATIVE_PATH.as_posix()}")
    try:
        init_database(config, schema_sql)
    except pymysql.err.InterfaceError:
        # Conector fechado antecipadamente em função de fail() acima.
        raise SystemExit(1)
    except pymysql.MySQLError as error:
        fail("Falha ao inicializar banco; confira a configuração e a disponibilidade do MySQL.")

    print(f"{PROGRAM}: banco inicializado com sucesso.")


def run_apply(migration_id: str, confirm_production: bool) -> None:
    try:
        repo_root = find_repo_root()
        config = load_config(repo_root)
        check_production_gate(config, confirm_production)

        # Resolve o arquivo de migration pelo ID autorizado
        if migration_id not in ALLOWED_MIGRATIONS:
            fail(f"Migration não autorizada: {migration_id}")

        migration_rel_path = ALLOWED_MIGRATIONS[migration_id]
        migration_path = (repo_root / migration_rel_path).resolve()

        # Validações de segurança: caminho deve estar dentro do repo, ser arquivo .sql, não vazio
        try:
            migration_path.relative_to(repo_root.resolve())
        except ValueError:
            fail("Caminho da migration fora da raiz do repositório.")

        if migration_path.suffix.lower() != ".sql":
            fail("Migration deve ter extensão .sql")

        if not migration_path.is_file():
            fail(f"Arquivo de migration não encontrado: {migration_rel_path}")

        schema_sql = load_schema_sql(migration_path)
        statements = split_statements(schema_sql)
        if not statements:
            fail("Arquivo de migration sem comandos executáveis.")

    except ConfigError as error:
        fail(str(error))
    except SchemaError as error:
        fail(str(error))

    print(f"Alvo: {config.user}@{config.host}:{config.port} banco `{config.database}`")
    print(f"Migration: {migration_rel_path}")
    try:
        with connect(config) as connection:
            with connection.cursor() as cursor:
                for statement in statements:
                    cursor.execute(statement)
    except pymysql.MySQLError as error:
        fail(f"Falha ao aplicar migration; confira a configuração e a disponibilidade do MySQL: {error}")

    print(f"{PROGRAM}: migration {migration_id} aplicada com sucesso.")


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "init":
        run_init(args.confirm_production)
        return
    if args.command == "apply":
        run_apply(args.migration, args.confirm_production)
        return
    # check command
    try:
        repo_root = find_repo_root()
        config = load_config(repo_root)
        with connect(config) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SET SESSION TRANSACTION READ ONLY")
                cursor.execute("SELECT 1")
        print(f"{PROGRAM}: check concluído.")
    except (ConfigError, SchemaError, OSError, ValueError, pymysql.MySQLError):
        fail("Operação cancelada ou falhou; confira configuração, TLS e disponibilidade do MySQL.")


if __name__ == "__main__":
    main()
