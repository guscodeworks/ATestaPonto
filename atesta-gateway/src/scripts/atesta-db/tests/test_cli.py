"""Testes automatizados para atesta_db.cli (com mocks)."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from atesta_db.cli import PROGRAM, build_parser, check_production_gate, init_database, run_init
from atesta_db.config import DbConfig


class TestCliParser:
    """Testes do argparse."""

    def test_help_exits_zero(self, capsys):
        parser = build_parser()
        with pytest.raises(SystemExit) as exc:
            parser.parse_args(["--help"])
        assert exc.value.code == 0
        out = capsys.readouterr().out
        assert "atesta-db" in out

    def test_init_help(self, capsys):
        parser = build_parser()
        with pytest.raises(SystemExit) as exc:
            parser.parse_args(["init", "--help"])
        assert exc.value.code == 0
        out = capsys.readouterr().out
        assert "--confirm-production" in out

    def test_init_requires_confirm_flag(self):
        parser = build_parser()
        args = parser.parse_args(["init"])
        assert args.command == "init"
        assert args.confirm_production is False

    def test_init_with_confirm_flag(self):
        parser = build_parser()
        args = parser.parse_args(["init", "--confirm-production"])
        assert args.confirm_production is True


class TestCheckProductionGate:
    """Testes do gate de produção."""

    def test_dev_allows(self):
        cfg = DbConfig(host="h", port=3306, user="u", password="p", database="db", is_production=False)
        check_production_gate(cfg, confirm_production=False)  # não levanta

    def test_prod_without_confirm_fails(self):
        cfg = DbConfig(host="h", port=3306, user="u", password="p", database="db", is_production=True)
        with pytest.raises(SystemExit) as exc:
            check_production_gate(cfg, confirm_production=False)
        assert exc.value.code == 1

    def test_prod_with_confirm_allows(self):
        cfg = DbConfig(host="h", port=3306, user="u", password="p", database="db", is_production=True)
        check_production_gate(cfg, confirm_production=True)  # não levanta


class TestInitDatabase:
    """Testes de execução do DDL (mockado)."""

    def test_empty_db_executes_creates(self):
        cfg = DbConfig(host="h", port=3306, user="u", password="p", database="db", is_production=False)
        sql = """CREATE TABLE a (id INT); CREATE TABLE b (id INT);"""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None  # banco vazio
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        with patch("atesta_db.cli.pymysql.connect", return_value=mock_conn):
            init_database(cfg, sql)

        assert mock_cursor.execute.call_count >= 3  # CREATE DB, USE, SELECT, 2 CREATE TABLE
        # Verifica que as tabelas foram criadas
        calls = [str(c) for c in mock_cursor.execute.call_args_list]
        creates = [c for c in calls if "CREATE TABLE" in c]
        assert len(creates) == 2

    def test_non_empty_db_fails_before_ddl(self):
        cfg = DbConfig(host="h", port=3306, user="u", password="p", database="db", is_production=False)
        sql = "CREATE TABLE a (id INT);"
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = ("existing_table",)  # banco NÃO vazio
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        with patch("atesta_db.cli.pymysql.connect", return_value=mock_conn):
            with pytest.raises(SystemExit) as exc:
                init_database(cfg, sql)
        assert exc.value.code == 1
        # Nenhum CREATE TABLE deve ter sido executado
        creates = [c for c in mock_cursor.execute.call_args_list if "CREATE TABLE" in str(c)]
        assert len(creates) == 0

    def test_mysql_error_rolls_back(self):
        cfg = DbConfig(host="h", port=3306, user="u", password="p", database="db", is_production=False)
        sql = "CREATE TABLE a (id INT);"
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        # Simula erro no 4º execute (CREATE TABLE) - precisa ser pymysql.MySQLError
        import pymysql
        mock_cursor.execute.side_effect = [None, None, None, pymysql.MySQLError("falha SQL")]
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        with patch("atesta_db.cli.pymysql.connect", return_value=mock_conn):
            with pytest.raises(pymysql.MySQLError) as exc:
                init_database(cfg, sql)
        assert "falha SQL" in str(exc.value)
        mock_conn.rollback.assert_called_once()
        mock_conn.commit.assert_not_called()


class TestRunInit:
    """Testes de integração do fluxo init (mockado)."""

    def test_init_success_outputs_target(self, capsys):
        cfg = DbConfig(host="mockhost", port=3306, user="mockuser", password="secret123", database="mockdb", is_production=False)
        sql = "CREATE TABLE a (id INT);"

        with patch("atesta_db.cli.find_repo_root", return_value=Path("/fake/repo")), \
             patch("atesta_db.cli.load_config", return_value=cfg), \
             patch("atesta_db.cli.resolve_schema_path"), \
             patch("atesta_db.cli.load_schema_sql", return_value=sql), \
             patch("atesta_db.cli.init_database") as mock_init:
            run_init(confirm_production=False)

        out = capsys.readouterr().out
        assert "mockhost" in out
        assert "mockdb" in out
        assert "mockuser" in out
        assert "secret123" not in out  # senha não vazada
        mock_init.assert_called_once()

    def test_production_without_confirm_exits_before_ddl(self, capsys):
        cfg = DbConfig(host="h", port=3306, user="u", password="p", database="db", is_production=True)
        sql = "CREATE TABLE a (id INT);"

        with patch("atesta_db.cli.find_repo_root", return_value=Path("/fake/repo")), \
             patch("atesta_db.cli.load_config", return_value=cfg), \
             patch("atesta_db.cli.resolve_schema_path"), \
             patch("atesta_db.cli.load_schema_sql", return_value=sql), \
             patch("atesta_db.cli.init_database") as mock_init:
            with pytest.raises(SystemExit) as exc:
                run_init(confirm_production=False)

        assert exc.value.code == 1
        mock_init.assert_not_called()
        err = capsys.readouterr().err
        assert "--confirm-production" in err


if __name__ == "__main__":
    pytest.main([__file__, "-v"])