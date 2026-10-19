#!/usr/bin/env python3
"""Testa /ready e o healthcheck com MySQL/Redis descartaveis, sem Node ou .env real.

Requer a imagem: docker build -t atestaponto-spring-standalone:readiness backend-spring
Executar da raiz: python3 backend-spring/scripts/check-readiness.py
"""
import hashlib
import http.client
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
STANDALONE = ROOT / "backend-spring/standalone"
IMAGE = "atestaponto-spring-standalone:readiness"
ENV = {key: os.environ[key] for key in ("PATH", "HOME", "SystemRoot", "WINDIR", "USERPROFILE", "DOCKER_HOST", "DOCKER_CONTEXT", "XDG_RUNTIME_DIR") if key in os.environ}


def run(*args, check=True):
    result = subprocess.run(args, env=ENV, capture_output=True, text=True, timeout=240)
    if check and result.returncode:
        raise AssertionError("Falha em " + " ".join(args[:3]) + "; saida omitida para proteger segredos")
    return result


def snapshot_containers(ids):
    result = {}
    for ident in ids:
        item = json.loads(run("docker", "inspect", ident).stdout)[0]
        data = {key: item[key] for key in ("Id", "Config", "HostConfig", "RestartCount")}
        data["networks"] = item["NetworkSettings"]["Networks"]
        data["state"] = {key: item["State"][key] for key in ("Status", "StartedAt", "Pid")}
        result[ident] = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    return result


def snapshot_env():
    paths = run("rg", "--files", "--hidden", "--no-ignore", "-g", ".env", "-g", ".env.*",
                "-g", "!node_modules", "-g", "!.git", str(ROOT)).stdout.splitlines()
    return {path: hashlib.sha256(Path(path).read_bytes()).hexdigest() for path in paths}


def main():
    ids = run("docker", "ps", "-aq").stdout.split()
    before, env_before = snapshot_containers(ids), snapshot_env()
    project = "atesta-readiness-check-" + uuid.uuid4().hex[:10]
    with tempfile.TemporaryDirectory(prefix=project + "-") as temporary:
        folder = Path(temporary)
        os.chmod(folder, 0o700)
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        values = dict(line.split("=", 1) for line in (STANDALONE / ".env.example").read_text().splitlines()
                      if line and not line.startswith("#"))
        for key in ("DB_PASSWORD", "MYSQL_ROOT_PASSWORD", "JWT_SECRET", "SESSION_SECRET", "INTERNAL_API_SHARED_KEY", "GOVBR_CLIENT_SECRET"):
            values[key] = secrets.token_hex(32)
        values.update(SPRING_HTTP_PORT=str(port), DB_NAME="readiness_fictional", DB_USER="readiness_fixture",
                      CORS_ORIGIN=f"http://localhost:{port}", APP_BASE_URL=f"http://localhost:{port}",
                      GOVBR_REDIRECT_URI=f"http://localhost:{port}/auth/govbr/callback",
                      GOVBR_AUTHORIZE_URL="http://oauth.fixture.invalid/authorize", GOVBR_TOKEN_URL="http://oauth.fixture.invalid/token",
                      GOVBR_USERINFO_URL="http://oauth.fixture.invalid/userinfo", GOVBR_CLIENT_ID="fictional-readiness-client")
        env_file = folder / ".env"
        env_file.write_text("\n".join(key + "=" + value for key, value in values.items()) + "\n")
        os.chmod(env_file, 0o600)
        override = folder / "override.json"
        override.write_text(json.dumps({"services": {"spring": {"image": IMAGE, "mem_limit": "512m"},
                                                    "mysql": {"mem_limit": "512m"}, "redis": {"mem_limit": "128m"}}}))
        command = ["docker", "compose", "-p", project, "--env-file", str(env_file), "-f", str(STANDALONE / "compose.yaml"), "-f", str(override)]

        def compose(*args, check=True):
            return run(*command, *args, check=check)

        def request(path):
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
            try:
                connection.request("GET", path)
                response = connection.getresponse()
                return response.status, json.loads(response.read()), response.getheader("Cache-Control", "")
            finally:
                connection.close()

        def wait_ready():
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                try:
                    if request("/ready")[0] == 200:
                        return
                except (OSError, http.client.HTTPException):
                    pass
                time.sleep(1)
            raise AssertionError("Spring nao recuperou prontidao no prazo")

        def check_case(label, ready_status, health_status):
            status, body, cache = request("/ready")
            assert status == ready_status, label + ": HTTP inesperado em /ready"
            assert body == {"status": "UP" if ready_status == 200 else "DOWN"}, label + ": corpo inesperado"
            assert "no-store" in cache, label + ": resposta nao deve ser cacheada"
            old_status, old_body, _ = request("/health")
            assert old_status == health_status and old_body == {
                "status": "UP" if health_status == 200 else "DOWN", "service": "backend-spring",
                "database": "connected" if health_status == 200 else "unavailable"}, label + ": contrato de /health mudou"
            probe = compose("exec", "-T", "spring", *healthcheck, check=False)
            assert (probe.returncode == 0) == (ready_status == 200), label + ": healthcheck Docker incorreto"
            print(f"APROVADO: {label}; /ready={ready_status}, /health={health_status}, healthcheck={'OK' if probe.returncode == 0 else 'FALHA'}", flush=True)

        try:
            compose("config", "--quiet")
            print("INFO: iniciando somente Spring/MySQL/Redis temporarios", flush=True)
            compose("up", "-d", "--no-build", "--wait", "--wait-timeout", "180")
            spring = compose("ps", "-q", "spring").stdout.strip()
            info = json.loads(run("docker", "inspect", spring).stdout)[0]
            healthcheck = info["Config"]["Healthcheck"]["Test"][1:]
            assert "/ready " in healthcheck[-1] and "/health " not in healthcheck[-1]
            check_case("MySQL e Redis disponiveis", 200, 200)
            compose("stop", "mysql")
            check_case("MySQL indisponivel", 503, 503)
            compose("start", "mysql")
            wait_ready()
            compose("stop", "redis")
            check_case("Redis indisponivel", 503, 200)
            compose("start", "redis")
            wait_ready()
            print("APROVADO: recuperacao sem reiniciar Spring", flush=True)
        finally:
            cleanup = compose("down", "--volumes", "--remove-orphans", "--timeout", "20", check=False)
            preserved = before == snapshot_containers(ids) and env_before == snapshot_env()
            assert cleanup.returncode == 0, "Falha na limpeza da infraestrutura temporaria"
            assert preserved, "Ambiente existente mudou durante a execucao"
            for kind in ("network", "volume"):
                names = run("docker", kind, "ls", "--filter", "label=com.docker.compose.project=" + project, "--format", "{{.Name}}").stdout.strip()
                assert not names, "Recursos temporarios restantes: " + kind
            assert not run("docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=" + project).stdout.strip()
            print("APROVADO: limpeza completa; .env e containers existentes (incluindo mysql-dev/node-dev) preservados", flush=True)


if __name__ == "__main__":
    main()
