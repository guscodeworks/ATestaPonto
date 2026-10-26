"""Resolução e validação de configuração do banco para a CLI atesta-db.

Precedência explícita: variáveis de ambiente > backend-spring/.env >
atesta-gateway/.env (fallback transitório). Nunca registra senhas ou segredos.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

DEFAULT_DB_PORT = 3306

SAFE_DATABASE_NAME_RE = re.compile(r"^[A-Za-z0-9_]+$")

# Marcador da raiz do repositório: o baseline canônico sempre vive aqui,
# independentemente do diretório corrente de onde a CLI for chamada.
ROOT_MARKER = Path("database/schema/ponto.sql")

ENV_FILES = (
    Path("backend-spring/.env"),
    Path("atesta-gateway/.env"),  # fallback transitório durante a migração
)


class ConfigError(Exception):
    """Erro de configuração ou ambiente; aborta antes de qualquer DDL."""


@dataclass(frozen=True)
class DbConfig:
    host: str
    port: int
    user: str
    password: str
    database: str
    is_production: bool


def find_repo_root(start: Path | None = None) -> Path:
    """Sobe até a raiz do repositório a partir de qualquer diretório corrente."""
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / ROOT_MARKER).is_file():
            return candidate
    raise ConfigError(
        "Raiz do repositório não encontrada: procurei database/schema/ponto.sql "
        "subindo a partir do diretório corrente."
    )


def parse_env_file(path: Path) -> dict[str, str]:
    """Parser simples de KEY=VALUE; ignora comentários e linhas malformadas."""
    values: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return values
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        # Remove aspas simples/duplas envolventes, padrão comum em .env.
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key] = value
    return values


def load_config(repo_root: Path, environ: dict[str, str] | None = None) -> DbConfig:
    """Monta a configuração respeitando a precedência env > backend > gateway."""
    env = dict(environ if environ is not None else os.environ)

    # Precedência env > backend > gateway: os arquivos são aplicados com
    # setdefault (fonte mais forte primeiro); o ambiente sempre vence.
    for env_file in ENV_FILES:
        for key, value in parse_env_file(repo_root / env_file).items():
            env.setdefault(key, value)

    host = (env.get("DB_HOST") or "").strip()
    user = (env.get("DB_USER") or "").strip()
    database = (env.get("DB_NAME") or "").strip()

    missing = [
        name
        for name, value in (
            ("DB_HOST", host),
            ("DB_USER", user),
            ("DB_NAME", database),
        )
        if not value
    ]

    # Senha: DB_PASSWORD é a forma atual; DB_PASS é alias legado aceito.
    password = (env.get("DB_PASSWORD") or "").strip() or (env.get("DB_PASS") or "").strip()
    if not password:
        missing.append("DB_PASSWORD")

    if missing:
        raise ConfigError(
            "Variáveis obrigatórias ausentes: "
            + ", ".join(dict.fromkeys(missing))
            + ". Configure-as no ambiente ou nos arquivos .env "
            + " > ".join(str(p) for p in ENV_FILES)
            + "."
        )

    if not SAFE_DATABASE_NAME_RE.fullmatch(database):
        raise ConfigError(
            "DB_NAME inválido. Use apenas letras, números e underscore "
            "(o nome é interpolado em CREATE DATABASE/USE, sem placeholders)."
        )

    raw_port = (env.get("DB_PORT") or "").strip()
    if raw_port:
        try:
            port = int(raw_port)
        except ValueError as exc:
            raise ConfigError("DB_PORT inválido. Use um número entre 1 e 65535.") from exc
        if not 1 <= port <= 65535:
            raise ConfigError("DB_PORT inválido. Use um número entre 1 e 65535.")
    else:
        port = DEFAULT_DB_PORT

    is_production = (env.get("NODE_ENV") or "").strip().lower() == "production"

    return DbConfig(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        is_production=is_production,
    )
