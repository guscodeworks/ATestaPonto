"""Execução do baseline canônico pelo atesta-db.

Somente database/schema/ponto.sql é permitido; o conteúdo não é copiado nem
alterado. O divisor de statements preserva a semântica do MySQL com
multipleStatements usado pelo script Node anterior.
"""

from __future__ import annotations

from pathlib import Path

SCHEMA_RELATIVE_PATH = Path("database/schema/ponto.sql")


class SchemaError(Exception):
    """Erro ao localizar/carregar o baseline canônico."""


def resolve_schema_path(repo_root: Path) -> Path:
    schema_path = (repo_root / SCHEMA_RELATIVE_PATH).resolve()
    if not schema_path.is_file():
        raise SchemaError(
            f"Baseline canônico não encontrado: {SCHEMA_RELATIVE_PATH.as_posix()} "
            "(a partir da raiz do repositório)."
        )
    return schema_path


def load_schema_sql(schema_path: Path) -> str:
    # utf-8-sig remove o BOM que alguns editores adicionam e que quebraria o SQL.
    sql = schema_path.read_text(encoding="utf-8-sig").strip()
    if not sql:
        raise SchemaError(f"Arquivo SQL vazio: {schema_path}")
    return sql


def split_statements(sql: str) -> list[str]:
    """Divide o script em statements pelo ';' fora de strings/comentários.

    Respeita aspas simples e duplas, identificadores entre crases, escapes
    duplicados ('') e comentários -- até o fim da linha e /* ... */.
    Somente scripts internos confiáveis passam por aqui (baseline canônico);
    ainda assim a divisão é sintática, não uma aproximação ingênua.
    """
    statements: list[str] = []
    current: list[str] = []
    i = 0
    n = len(sql)
    while i < n:
        char = sql[i]
        if char == "-" and sql[i + 1 : i + 2] == "-":
            end = sql.find("\n", i)
            if end == -1:
                end = n
            current.append(sql[i:end])
            i = end
        elif char == "/" and sql[i + 1 : i + 2] == "*":
            end = sql.find("*/", i + 2)
            end = n if end == -1 else end + 2
            current.append(sql[i:end])
            i = end
        elif char in ("'", '"', "`"):
            quote = char
            start = i
            i += 1
            while i < n:
                if sql[i] == "\\":  # escape no estilo MySQL
                    i += 2
                elif sql[i] == quote:
                    if sql[i + 1 : i + 2] == quote:  # aspas duplicadas ('')
                        i += 2
                    else:
                        i += 1
                        break
                else:
                    i += 1
            else:
                i = n
            current.append(sql[start:i])
        elif char == ";":
            statement = "".join(current).strip()
            if statement and _has_executable_content(statement):
                statements.append(statement)
            current = []
            i += 1
        else:
            current.append(char)
            i += 1
    statement = "".join(current).strip()
    if statement and _has_executable_content(statement):
        statements.append(statement)
    return statements


def _has_executable_content(statement: str) -> bool:
    """Descarta blocos somente com comentários, sem código SQL."""
    stripped = statement.lstrip()
    while True:
        if stripped.startswith("--"):
            newline = stripped.find("\n")
            stripped = stripped[newline + 1 :] if newline != -1 else ""
        elif stripped.startswith("/*"):
            end = stripped.find("*/")
            stripped = stripped[end + 2 :] if end != -1 else ""
        else:
            break
    return bool(stripped.strip())
