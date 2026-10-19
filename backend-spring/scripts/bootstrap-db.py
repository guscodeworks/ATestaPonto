#!/usr/bin/env python3
"""MySQL descartável com o baseline canônico; execução manual, sem Node ou Spring."""
import argparse
import hashlib
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import tempfile
import time
import uuid


ROOT = Path(__file__).resolve().parents[2]
BASELINE = "atesta-gateway/database/schema/ponto.sql"
MIGRATIONS = "atesta-gateway/database/migrations"
# A única migration já está incorporada ao baseline; mudanças exigem nova revisão.
REVIEWED = {
    BASELINE: "0a642abc1401dd6cce405182e13e28d6e48a468f2f7e1944cc0872a83079b715",
    MIGRATIONS + "/20260908_ponto_idempotencia.sql":
        "ebc2abdca29e00e06bb8186da6ca96fd2672ce3c8eebe297b265588a3f1973aa",
}


def load_schema():
    files = {BASELINE} | {p.relative_to(ROOT).as_posix() for p in (ROOT / MIGRATIONS).rglob("*.sql")}
    if files != set(REVIEWED):
        raise RuntimeError("Migrations adicionadas/removidas: revise o plano de bootstrap antes de executar.")
    contents = {name: (ROOT / name).read_text(encoding="utf-8-sig") for name in REVIEWED}
    for name, digest in REVIEWED.items():
        if hashlib.sha256(contents[name].encode("utf-8")).hexdigest() != digest:
            raise RuntimeError(f"SQL alterado: {name}. Revise o baseline e as migrations antes de executar.")
    return contents[BASELINE]


def interrupt(_signal, _frame):
    raise KeyboardInterrupt


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.parse_args()
    schema = load_schema()
    host = "npipe:////./pipe/docker_engine" if os.name == "nt" else "unix:///var/run/docker.sock"
    environment = {key: os.environ[key] for key in (
        "PATH", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SystemRoot", "WINDIR",
        "TEMP", "TMP", "TMPDIR",
    ) if key in os.environ}
    root_password, password = secrets.token_hex(32), secrets.token_hex(32)
    environment.update(MYSQL_ROOT_PASSWORD=root_password, MYSQL_ROOT_HOST="localhost",
                       MYSQL_USER="atesta_bootstrap", MYSQL_PASSWORD=password, MYSQL_PWD=root_password)

    def docker(*arguments, input=None):
        result = subprocess.run(
            ["docker", "--host", host, *arguments], env=environment, input=input,
            capture_output=True, text=True, encoding="utf-8", timeout=60,
        )
        if result.returncode:
            # A saída do Docker/MySQL pode conter credenciais; não a registre.
            raise RuntimeError(f"Docker {arguments[0]} falhou (código {result.returncode}; saída omitida).")
        return result.stdout.strip()

    def sql(statement, database=None):
        arguments = ["exec", "-i", "--env", "MYSQL_PWD", container, "mysql", "--no-defaults",
                     "--protocol=socket", "--user=root", "--batch", "--skip-column-names",
                     "--default-character-set=utf8mb4"]
        if database:
            arguments.append("--database=" + database)
        return docker(*arguments, input=statement)

    signal.signal(signal.SIGTERM, interrupt)
    container = None
    database = "atestabootstrap" + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix="atesta-db-bootstrap-") as temporary:
        folder = Path(temporary)
        cidfile = folder / "container.id"
        try:
            container = docker(
                "create", "--pull=never", "--rm", "--cidfile", str(cidfile),
                "--name", "atesta-db-bootstrap-" + uuid.uuid4().hex[:12],
                "--label", "atestaponto.purpose=spring-db-bootstrap", "--memory", "768m",
                "--tmpfs", "/var/lib/mysql:rw,size=512m", "-p", "127.0.0.1::3306",
                "-e", "MYSQL_ROOT_PASSWORD", "-e", "MYSQL_ROOT_HOST",
                "-e", "MYSQL_USER", "-e", "MYSQL_PASSWORD",
                "mysql:8.4", "--innodb-buffer-pool-size=64M",
            )
            docker("start", container)
            deadline = time.monotonic() + 120
            while True:
                try:
                    # O servidor provisório do entrypoint usa skip_networking.
                    if sql("SELECT IF(@@GLOBAL.skip_networking, 0, 1);") == "1":
                        break
                except RuntimeError:
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError("MySQL temporário não ficou pronto em 120 segundos.")
                time.sleep(.5)

            # Sem IF NOT EXISTS: até um banco existente vazio deve ser recusado.
            sql(f"CREATE DATABASE `{database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            sql(schema, database)
            if sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();", database) != "10":
                raise RuntimeError("O bootstrap não produziu as 10 tabelas esperadas.")
            sql(f"GRANT ALL PRIVILEGES ON `{database}`.* TO 'atesta_bootstrap'@'%';")
            port = docker("port", container, "3306/tcp").removeprefix("127.0.0.1:")
            if not port.isdecimal():
                raise RuntimeError("Publicação de porta inesperada: esperado somente 127.0.0.1.")
            configuration = folder / "database.env"
            with os.fdopen(os.open(configuration, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as file:
                file.write(f"DB_HOST=127.0.0.1\nDB_PORT={port}\nDB_NAME={database}\n"
                           f"DB_USER=atesta_bootstrap\nDB_PASSWORD={password}\n")
            print(f"MySQL temporário pronto: 127.0.0.1:{port}/{database}", flush=True)
            print("Baseline aplicado uma vez; migration 20260908_ponto_idempotencia.sql já incorporada.", flush=True)
            print(f"Configuração temporária privada: {configuration}", flush=True)
            print("Mantenha este processo aberto. Ctrl+C remove o container, os dados e a configuração.", flush=True)
            while True:
                time.sleep(1)
        finally:
            # O cidfile permite limpar também após interrupção na criação do container.
            if container is None and cidfile.is_file():
                container = cidfile.read_text().strip()
            if container:
                docker("rm", "--force", "--volumes", container)
                print("Container e banco temporários removidos.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        # TimeoutExpired inclui o comando; as senhas ficam somente no ambiente.
        print(f"Bootstrap interrompido: {error}", file=sys.stderr)
        raise SystemExit(1)
