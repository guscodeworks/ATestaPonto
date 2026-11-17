"""Testes automatizados para atesta_db.schema."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from atesta_db.schema import (
    SchemaError,
    load_schema_sql,
    resolve_schema_path,
    split_statements,
)


class TestSplitStatements:
    """Testes do divisor de statements SQL."""

    def test_basic_statements(self):
        sql = "CREATE TABLE a (id INT); CREATE TABLE b (id INT);"
        stmts = split_statements(sql)
        assert len(stmts) == 2
        assert "CREATE TABLE a" in stmts[0]
        assert "CREATE TABLE b" in stmts[1]

    def test_semicolon_inside_single_quotes(self):
        sql = "INSERT INTO t VALUES ('a;b'); CREATE TABLE x (id INT);"
        stmts = split_statements(sql)
        assert len(stmts) == 2
        assert "'a;b'" in stmts[0]
        assert "CREATE TABLE x" in stmts[1]

    def test_semicolon_inside_double_quotes(self):
        sql = 'INSERT INTO t VALUES ("a;b"); CREATE TABLE x (id INT);'
        stmts = split_statements(sql)
        assert len(stmts) == 2
        assert '"a;b"' in stmts[0]

    def test_backtick_identifiers(self):
        sql = "CREATE TABLE `t` (id INT);"
        stmts = split_statements(sql)
        assert len(stmts) == 1
        assert "`t`" in stmts[0]

    def test_escaped_single_quotes(self):
        sql = "INSERT INTO t VALUES ('it''s ok');"
        stmts = split_statements(sql)
        assert len(stmts) == 1
        assert "it''s ok" in stmts[0]

    def test_line_comment_ignored(self):
        sql = "-- comentario\nCREATE TABLE a (id INT);"
        stmts = split_statements(sql)
        assert len(stmts) == 1
        assert "CREATE TABLE a" in stmts[0]

    def test_block_comment_ignored(self):
        sql = "/* comentario */ CREATE TABLE a (id INT);"
        stmts = split_statements(sql)
        assert len(stmts) == 1
        assert "CREATE TABLE a" in stmts[0]

    def test_block_comment_with_semicolon_inside(self):
        sql = "/* bloco ; com ; ponto e virgula */ CREATE TABLE a (id INT);"
        stmts = split_statements(sql)
        assert len(stmts) == 1
        assert "CREATE TABLE a" in stmts[0]

    def test_trailing_comment_after_statement(self):
        sql = "CREATE TABLE a (id INT); -- fim"
        stmts = split_statements(sql)
        assert len(stmts) == 1
        assert "CREATE TABLE a" in stmts[0]

    def test_only_comments_discarded(self):
        sql = "-- so comentario\n/* outro */"
        stmts = split_statements(sql)
        assert len(stmts) == 0

    def test_mixed_content(self):
        sql = """-- header
CREATE TABLE `cargos` (id INT);
INSERT INTO t VALUES ('hello;world'), ("x''y"); -- trailing
/* bloco ; */ SELECT 1;
-- so comentario;
"""
        stmts = split_statements(sql)
        # Espera: 3 statements executáveis (CREATE, INSERT, SELECT)
        assert len(stmts) == 3
        assert "CREATE TABLE" in stmts[0]
        assert "INSERT INTO" in stmts[1]
        assert "SELECT 1" in stmts[2]


class TestResolveSchemaPath:
    """Testes de localização do baseline canônico."""

    def test_resolves_real_schema(self):
        repo_root = Path("/home/dymaskawam/Documentos/GitHub/ATestaPonto").resolve()
        path = resolve_schema_path(repo_root)
        assert path.is_file()
        assert path.name == "ponto.sql"

    def test_fails_on_missing(self, tmp_path: Path):
        with pytest.raises(SchemaError) as exc:
            resolve_schema_path(tmp_path)
        assert "não encontrado" in str(exc.value)


class TestLoadSchemaSql:
    """Testes de carregamento do SQL."""

    def test_loads_real_schema(self):
        repo_root = Path("/home/dymaskawam/Documentos/GitHub/ATestaPonto").resolve()
        path = resolve_schema_path(repo_root)
        sql = load_schema_sql(path)
        assert sql.startswith("-- Baseline")
        assert "CREATE TABLE" in sql
        assert len(sql) > 1000

    def test_rejects_empty(self, tmp_path: Path):
        empty = tmp_path / "empty.sql"
        empty.write_text("   \n\n")
        with pytest.raises(SchemaError) as exc:
            load_schema_sql(empty)
        assert "vazio" in str(exc.value)

    def test_strips_bom(self, tmp_path: Path):
        with_bom = tmp_path / "bom.sql"
        with_bom.write_bytes(b"\xef\xbb\xbf-- sql\nCREATE TABLE t (id INT);")
        sql = load_schema_sql(with_bom)
        assert not sql.startswith("\ufeff")
        assert sql.startswith("-- sql")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])