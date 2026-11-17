"""Testes automatizados para atesta_db.config."""

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from atesta_db.config import (
    ConfigError,
    DbConfig,
    OVERRIDE_ROOT_ENV,
    PRODUCTION_DATABASES_ENV,
    PRODUCTION_HOSTS_ENV,
    find_repo_root,
    load_config,
    parse_env_file,
)


class TestParseEnvFile:
    """Testes do parser de .env (compatível dotenv/Node)."""

    def test_basic_key_value(self, tmp_path: Path):
        env = tmp_path / ".env"
        env.write_text("DB_HOST=localhost\nDB_USER=root\n")
        assert parse_env_file(env) == {"DB_HOST": "localhost", "DB_USER": "root"}

    def test_export_prefix(self, tmp_path: Path):
        env = tmp_path / ".env"
        env.write_text("export DB_HOST=localhost\n")
        assert parse_env_file(env) == {"DB_HOST": "localhost"}

    def test_quoted_values(self, tmp_path: Path):
        env = tmp_path / ".env"
        env.write_text('DB_HOST="localhost"\nDB_PASS=\'secret\'\n')
        assert parse_env_file(env) == {"DB_HOST": "localhost", "DB_PASS": "secret"}

    def test_inline_comment_hash(self, tmp_path: Path):
        env = tmp_path / ".env"
        env.write_text("DB_HOST=localhost # comentario\n")
        assert parse_env_file(env) == {"DB_HOST": "localhost"}

    def test_inline_comment_slash(self, tmp_path: Path):
        env = tmp_path / ".env"
        env.write_text("DB_HOST=localhost // comentario\n")
        assert parse_env_file(env) == {"DB_HOST": "localhost"}

    def test_comment_inside_quotes_preserved(self, tmp_path: Path):
        env = tmp_path / ".env"
        env.write_text('DB_HOST="localhost # nao comentario"\n')
        assert parse_env_file(env) == {"DB_HOST": "localhost # nao comentario"}

    def test_full_line_comments(self, tmp_path: Path):
        env = tmp_path / ".env"
        env.write_text("# comentario\n// outro\nDB_HOST=localhost\n")
        assert parse_env_file(env) == {"DB_HOST": "localhost"}

    def test_empty_lines_ignored(self, tmp_path: Path):
        env = tmp_path / ".env"
        env.write_text("\n\nDB_HOST=localhost\n\n")
        assert parse_env_file(env) == {"DB_HOST": "localhost"}

    def test_line_continuation(self, tmp_path: Path):
        env = tmp_path / ".env"
        env.write_text("DB_HOST=local\\\nhost\n")
        # Continuação simples junta com espaço (comportamento básico)
        assert parse_env_file(env) == {"DB_HOST": "local host"}

    def test_missing_file_returns_empty(self, tmp_path: Path):
        assert parse_env_file(tmp_path / "nao_existe.env") == {}


class TestFindRepoRoot:
    """Testes de descoberta da raiz do repositório."""

    def test_finds_root_from_subdir(self):
        root = Path("/home/dymaskawam/Documentos/GitHub/ATestaPonto").resolve()
        found = find_repo_root(root / "atesta-gateway" / "src" / "scripts")
        assert found == root

    def test_fails_outside_repo_without_override(self, tmp_path: Path):
        with pytest.raises(ConfigError) as exc:
            find_repo_root(tmp_path)
        assert "não encontrada" in str(exc.value)

    def test_override_env_works(self, tmp_path: Path):
        repo = tmp_path / "repo"
        (repo / "database" / "schema").mkdir(parents=True)
        (repo / "database" / "schema" / "ponto.sql").write_text("-- sql")
        os.environ[OVERRIDE_ROOT_ENV] = str(repo)
        try:
            found = find_repo_root(tmp_path / "qualquer" / "lugar")
            assert found == repo.resolve()
        finally:
            del os.environ[OVERRIDE_ROOT_ENV]

    def test_override_env_invalid(self, tmp_path: Path):
        bad = tmp_path / "bad"
        bad.mkdir()
        os.environ[OVERRIDE_ROOT_ENV] = str(bad)
        try:
            with pytest.raises(ConfigError) as exc:
                find_repo_root(tmp_path)
            assert "não contém" in str(exc.value)
        finally:
            del os.environ[OVERRIDE_ROOT_ENV]


class TestLoadConfig:
    """Testes de carregamento de configuração com precedência."""

    def setup_method(self):
        self.tmp = Path("/tmp/opencode/atestadb-config-test")
        self.tmp.mkdir(parents=True, exist_ok=True)
        (self.tmp / "backend-spring").mkdir(exist_ok=True)
        (self.tmp / "atesta-gateway").mkdir(exist_ok=True)
        (self.tmp / "database" / "schema").mkdir(parents=True, exist_ok=True)
        (self.tmp / "database" / "schema" / "ponto.sql").write_text("-- sql")

    def teardown_method(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _write_envs(self, backend: str = "", gateway: str = ""):
        (self.tmp / "backend-spring" / ".env").write_text(backend)
        (self.tmp / "atesta-gateway" / ".env").write_text(gateway)

    def test_env_vars_win_over_files(self):
        self._write_envs(
            "DB_HOST=from_backend\nDB_USER=u\nDB_NAME=db\nDB_PASSWORD=p",
            "DB_HOST=from_gateway\nDB_USER=u\nDB_NAME=db\nDB_PASSWORD=p",
        )
        cfg = load_config(self.tmp, environ={"DB_HOST": "from_env", "DB_USER": "u", "DB_NAME": "db", "DB_PASSWORD": "p"})
        assert cfg.host == "from_env"

    def test_backend_over_gateway(self):
        self._write_envs(
            "DB_HOST=from_backend\nDB_USER=u\nDB_NAME=db\nDB_PASSWORD=p",
            "DB_HOST=from_gateway\nDB_USER=u\nDB_NAME=db\nDB_PASSWORD=p",
        )
        cfg = load_config(self.tmp, environ={})
        assert cfg.host == "from_backend"

    def test_gateway_fallback(self):
        self._write_envs(
            "",
            "DB_HOST=from_gateway\nDB_USER=u\nDB_NAME=db\nDB_PASSWORD=p\n",
        )
        cfg = load_config(self.tmp, environ={})
        assert cfg.host == "from_gateway"

    def test_db_pass_alias(self):
        self._write_envs("DB_HOST=h\nDB_USER=u\nDB_NAME=db\nDB_PASS=legacypass")
        cfg = load_config(self.tmp, environ={})
        assert cfg.password == "legacypass"

    def test_db_pass_preferred_over_db_password(self):
        self._write_envs("DB_HOST=h\nDB_USER=u\nDB_NAME=db\nDB_PASSWORD=new\nDB_PASS=old")
        cfg = load_config(self.tmp, environ={})
        assert cfg.password == "new"

    def test_default_port_3306(self):
        self._write_envs("DB_HOST=h\nDB_USER=u\nDB_NAME=db\nDB_PASSWORD=p")
        cfg = load_config(self.tmp, environ={})
        assert cfg.port == 3306

    def test_invalid_port_rejected(self):
        self._write_envs("DB_HOST=h\nDB_USER=u\nDB_NAME=db\nDB_PASSWORD=p\nDB_PORT=70000")
        with pytest.raises(ConfigError) as exc:
            load_config(self.tmp, environ={})
        assert "inválido" in str(exc.value)

    def test_unsafe_db_name_rejected(self):
        self._write_envs("DB_HOST=h\nDB_USER=u\nDB_PASSWORD=p")
        with pytest.raises(ConfigError) as exc:
            load_config(self.tmp, environ={"DB_NAME": "bad name; drop"})
        assert "inválido" in str(exc.value)

    def test_missing_required_fails(self):
        self._write_envs("", "")
        with pytest.raises(ConfigError) as exc:
            load_config(self.tmp, environ={})
        assert "ausentes" in str(exc.value)

    def test_production_from_node_env(self):
        self._write_envs("DB_HOST=h\nDB_USER=u\nDB_NAME=db\nDB_PASSWORD=p\nNODE_ENV=production")
        cfg = load_config(self.tmp, environ={})
        assert cfg.is_production is True

    def test_production_from_explicit_host_list(self):
        self._write_envs("DB_HOST=prod.db.example\nDB_USER=u\nDB_NAME=db\nDB_PASSWORD=p")
        cfg = load_config(self.tmp, environ={
            PRODUCTION_HOSTS_ENV: "prod.db.example,other.host",
        })
        assert cfg.is_production is True

    def test_production_from_explicit_database_list(self):
        self._write_envs("DB_HOST=localhost\nDB_USER=u\nDB_NAME=prod_db\nDB_PASSWORD=p")
        cfg = load_config(self.tmp, environ={
            PRODUCTION_DATABASES_ENV: "prod_db,other_db",
        })
        assert cfg.is_production is True

    def test_production_host_overrides_node_env_dev(self):
        self._write_envs("DB_HOST=prod.db.example\nDB_USER=u\nDB_NAME=db\nDB_PASSWORD=p\nNODE_ENV=development")
        cfg = load_config(self.tmp, environ={
            PRODUCTION_HOSTS_ENV: "prod.db.example",
        })
        assert cfg.is_production is True


class TestConfigErrorMessages:
    """Verifica que mensagens de erro não vazam segredos."""

    def test_error_message_no_password_leak(self):
        tmp = Path("/tmp/opencode/atestadb-err")
        tmp.mkdir(parents=True, exist_ok=True)
        (tmp / "backend-spring").mkdir(exist_ok=True)
        (tmp / "database" / "schema").mkdir(parents=True, exist_ok=True)
        (tmp / "database" / "schema" / "ponto.sql").write_text("-- sql")
        try:
            # Força erro de DB_NAME inseguro (que vem depois da validação de senha)
            with pytest.raises(ConfigError) as exc:
                load_config(tmp, environ={"DB_HOST": "h", "DB_USER": "u", "DB_NAME": "bad;name", "DB_PASSWORD": "secret123"})
            # A mensagem de erro não deve conter a senha
            assert "secret123" not in str(exc.value)
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])