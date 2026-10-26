"""Ponto de entrada da CLI atesta-db.

Uso: atesta-db init [--confirm-production]
Instalação única na raiz do repositório: pipx install -e ./tools/atesta-db
"""

from __future__ import annotations

import argparse
import sys

import pymysql

from .config import ConfigError, DbConfig, find_repo_root, load_config
from .schema import SCHEMA_RELATIVE_PATH, SchemaError, load_schema_sql, resolve_schema_path, split_statements

PROGRAM = "atesta-db"


def fail(message: str) -> None:
    print(f"{PROGRAM}: erro: {message}", file=sys.stderr)
    raise SystemExit(1)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROGRAM,
        # O objetivo é permitir `atesta-db init` sem invocar Node nem
        # indicar arquivo Python manualmente.
        description="Inicializa o banco de dados vazio do ATestaPonto com o baseline canônico "
        "(database/schema/ponto.sql).",
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
    return parser


def check_production_gate(config: DbConfig, confirm_production: bool) -> None:
    if config.is_production and not confirm_production:
        fail(
            "NODE_ENV=production: é obrigatório passar --confirm-production "
            "para inicializar um banco em produção."
        )


def init_database(config: DbConfig, schema_sql: str) -> None:
    statements = split_statements(schema_sql)
    connection = None
    try:
        connection = pymysql.connect(
            host=config.host,
            port=config.port,
            user=config.user,
            password=config.password,
            charset="utf8mb4",
            autocommit=True,
        )
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
        fail(f"Falha ao inicializar banco: {error}")

    print(f"{PROGRAM}: banco inicializado com sucesso.")


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "init":
        run_init(args.confirm_production)


if __name__ == "__main__":
    main()
