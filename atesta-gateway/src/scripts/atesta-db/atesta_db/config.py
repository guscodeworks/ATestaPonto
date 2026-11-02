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

# Variável de ambiente para forçar a raiz do repositório quando executado
# fora da árvore do projeto (ex.: ATESTA_DB_ROOT=/caminho/do/repo).
OVERRIDE_ROOT_ENV = "ATESTA_DB_ROOT"

# Hosts/bancos conhecidos de produção — usados como guarda adicional além de
# NODE_ENV=production. O usuário deve declarar explicitamente quais alvos são
# "produção" via ATESTA_DB_PRODUCTION_HOSTS (lista separada por vírgula) ou
# ATESTA_DB_PRODUCTION_DATABASES.
PRODUCTION_HOSTS_ENV = "ATESTA_DB_PRODUCTION_HOSTS"
PRODUCTION_DATABASES_ENV = "ATESTA_DB_PRODUCTION_DATABASES"


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
    """Sobe até a raiz do repositório a partir de qualquer diretório corrente.

    Se ATESTA_DB_ROOT estiver definido, usa-o como ponto de partida (permite
    execução fora da árvore do repositório).
    """
    override = os.environ.get(OVERRIDE_ROOT_ENV)
    if override:
        candidate = Path(override).resolve()
        if (candidate / ROOT_MARKER).is_file():
            return candidate
        raise ConfigError(
            f"ATESTA_DB_ROOT={override} não contém {ROOT_MARKER.as_posix()}."
        )

    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / ROOT_MARKER).is_file():
            return candidate
    raise ConfigError(
        "Raiz do repositório não encontrada: procurei database/schema/ponto.sql "
        "subindo a partir do diretório corrente. "
        f"Defina {OVERRIDE_ROOT_ENV} para executar fora da árvore do projeto."
    )


def parse_env_file(path: Path) -> dict[str, str]:
    """Parser de .env compatível com formato comum (dotenv/Node).

    Suporta:
    - export KEY=VALUE
    - Comentários de linha inteira (# ou //)
    - Comentários inline (# após o valor, respeitando aspas)
    - Aspas simples/duplas envolventes
    - Continuação de linha com \ (básico)
    """
    values: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return values

    lines = text.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        stripped = raw.strip()
        # Continuação de linha: se termina com \ (fora de aspas), junta a próxima
        # Nota: implementação simples — ignora complexidades de aspas no final.
        if stripped.endswith("\\") and not _ends_in_quote(stripped):  # noqa: W605
            # Remove o \ e junta com a próxima linha
            lines[i] = stripped[:-1].rstrip() + " " + lines[i + 1].lstrip() if i + 1 < len(lines) else stripped[:-1].rstrip()
            del lines[i + 1]
            continue

        if not stripped or stripped.startswith("#") or stripped.startswith("//"):
            i += 1
            continue

        # export KEY=VALUE
        if stripped.startswith("export "):
            stripped = stripped[7:].lstrip()

        if "=" not in stripped:
            i += 1
            continue

        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip()

        # Remove comentário inline (# ou //) respeitando aspas
        value = _strip_inline_comment(value)

        if not key:
            i += 1
            continue

        # Remove aspas envolventes
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]

        values[key] = value
        i += 1

    return values


def _ends_in_quote(s: str) -> bool:
    """Verifica se a string termina com aspas não escapadas."""
    in_single = in_double = False
    i = 0
    while i < len(s):
        if s[i] == "'" and not in_double:
            in_single = not in_single
        elif s[i] == '"' and not in_single:
            in_double = not in_double
        elif s[i] == "\\":
            i += 2
            continue
        i += 1
    return in_single or in_double


def _strip_inline_comment(value: str) -> str:
    """Remove comentário inline (# ou //) respeitando aspas."""
    in_single = in_double = False
    for i, ch in enumerate(value):
        if ch == "'" and not in_double:
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double
        elif ch == "\\" and (in_single or in_double):
            continue  # próximo char é escapado
        elif not in_single and not in_double:
            if ch == "#" or (ch == "/" and i + 1 < len(value) and value[i + 1] == "/"):
                return value[:i].rstrip()
    return value


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

    # Guarda adicional: se o host/banco alvo estiver na lista explícita de
    # produção, força is_production=True mesmo sem NODE_ENV=production.
    if not is_production:
        prod_hosts = _parse_list_env(env.get(PRODUCTION_HOSTS_ENV, ""))
        prod_dbs = _parse_list_env(env.get(PRODUCTION_DATABASES_ENV, ""))
        if host in prod_hosts or database in prod_dbs:
            is_production = True

    return DbConfig(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        is_production=is_production,
    )


def _parse_list_env(value: str) -> list[str]:
    """Parseia lista separada por vírgula, removendo espaços e vazios."""
    return [v.strip() for v in value.split(",") if v.strip()]
