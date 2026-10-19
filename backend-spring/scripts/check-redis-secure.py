#!/usr/bin/env python3
"""Redis-only checks; requires packaged JAR, Java 21, local redis:7-alpine, Docker and OpenSSL."""
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def run(*args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, **kwargs)
    if result.returncode:
        print("FAIL command: " + args[0], flush=True)
        if args[0] in ("javac", "docker"):
            print(result.stderr, flush=True)
        for line in (result.stdout + result.stderr).splitlines():
            if line.startswith("FAIL Redis check:"):
                print(line, flush=True)
        result.check_returncode()
    return result.stdout.strip()


def main():
    with tempfile.TemporaryDirectory(prefix="atesta-redis-secure-") as temporary:
        folder = Path(temporary)
        with zipfile.ZipFile(ROOT / "target/backend-spring-0.0.1-SNAPSHOT.jar") as jar:
            for name in jar.namelist():
                if name.startswith(("BOOT-INF/lib/", "BOOT-INF/classes/")) and not name.endswith("/"):
                    jar.extract(name, folder)
        classpath = str(folder / "BOOT-INF/classes") + os.pathsep + str(folder / "BOOT-INF/lib/*")
        run("javac", "-cp", classpath, "-d", temporary, str(ROOT / "scripts/RedisSecureCheck.java"))
        password, store_password = secrets.token_hex(24), secrets.token_hex(24)
        env = {key: os.environ[key] for key in ("PATH", "JAVA_HOME", "DOCKER_HOST", "DOCKER_CONTEXT") if key in os.environ}
        env.update(REDIS_ENABLED="true", REDIS_HOST="localhost", REDIS_NAMESPACE="check:redis:secure",
                   NODE_ENV="production", SESSION_SECRET=secrets.token_hex(32),
                   INTERNAL_API_SHARED_KEY=secrets.token_hex(32), ADMIN_SESSION_SECURE="true")
        run("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
            "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost",
            "-keyout", str(folder / "server.key"), "-out", str(folder / "server.crt"))
        store_env = dict(env, CHECK_STORE_PASSWORD=store_password)
        run("keytool", "-importcert", "-noprompt", "-alias", "redis-check", "-file", str(folder / "server.crt"),
            "-keystore", str(folder / "trust.p12"), "-storepass:env", "CHECK_STORE_PASSWORD", env=store_env)

        def check(mode, settings):
            output = run("java", "-cp", temporary + os.pathsep + classpath, "RedisSecureCheck", mode,
                         env=dict(env, **settings), timeout=40)
            print(next(line for line in output.splitlines() if line.startswith("PASS ")), flush=True)

        for mode in ("plain", "password", "acl", "tls"):
            name = "atesta-redis-secure-" + uuid.uuid4().hex[:12]
            config = "save \"\"\nappendonly no\nbind 0.0.0.0\nprotected-mode no\n"
            if mode == "tls":
                config += "port 0\ntls-port 6379\ntls-cert-file /tmp/server.crt\ntls-key-file /tmp/server.key\ntls-ca-cert-file /tmp/server.crt\ntls-auth-clients no\n"
            if mode == "acl":
                config += "user default off\nuser fixture on >" + password + " ~* +@all\n"
            elif mode != "plain":
                config += "requirepass " + password + "\n"
            (folder / "redis.conf").write_text(config)
            (folder / "redis.conf").chmod(0o600)
            try:
                run("docker", "create", "--name", name, "--memory", "128m", "--user", "0:0",
                    "--entrypoint", "redis-server",
                    "--tmpfs", "/data:rw,size=16m", "-p", "127.0.0.1::6379", "redis:7-alpine",
                    "/tmp/redis.conf")
                for fixture in ("redis.conf", "server.crt", "server.key"):
                    run("docker", "cp", str(folder / fixture), name + ":/tmp/" + fixture)
                run("docker", "start", name)
                if run("docker", "inspect", "--format", "{{.State.Running}}", name) != "true":
                    print(run("docker", "logs", name).replace(password, "[redacted]"), flush=True)
                    raise RuntimeError("Temporary Redis exited")
                port = run("docker", "port", name, "6379/tcp").rsplit(":", 1)[1]
                settings = dict(REDIS_PORT=port, REDIS_PASSWORD=password if mode != "plain" else "",
                                REDIS_TLS=str(mode == "tls").lower(), REDIS_USERNAME="fixture" if mode == "acl" else "")
                if mode == "tls":
                    settings.update(CHECK_TRUSTSTORE=str(folder / "trust.p12"), CHECK_STORE_PASSWORD=store_password)
                deadline = time.monotonic() + 10
                while True:
                    cli = ["docker", "exec", "-e", "REDISCLI_AUTH", name, "redis-cli"]
                    if mode == "acl":
                        cli += ["--user", "fixture"]
                    if mode == "tls":
                        cli += ["--tls", "--cacert", "/tmp/server.crt"]
                    try:
                        if run(*cli, "PING", env=dict(env, REDISCLI_AUTH=settings["REDIS_PASSWORD"])) == "PONG":
                            break
                    except subprocess.CalledProcessError:
                        pass
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Temporary Redis unavailable")
                    time.sleep(.1)
                check(mode, settings)
                if mode != "plain":
                    check("unavailable", dict(settings, REDIS_PASSWORD=secrets.token_hex(24)))
                    print("PASS " + mode + ": incorrect password rejected", flush=True)
                if mode == "acl":
                    check("unavailable", dict(settings, REDIS_USERNAME="invalid-fixture"))
                    print("PASS ACL: incorrect username rejected", flush=True)
                if mode == "tls":
                    untrusted = {key: value for key, value in settings.items() if not key.startswith("CHECK_")}
                    check("unavailable", untrusted)
                    print("PASS TLS: untrusted certificate rejected", flush=True)
                    check("unavailable", dict(settings, REDIS_HOST="127.0.0.1"))
                    print("PASS TLS: incorrect hostname rejected", flush=True)
                run("docker", "stop", "-t", "0", name)
                check("unavailable", settings)
            finally:
                subprocess.run(["docker", "rm", "-f", name], capture_output=True, check=False)


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.SubprocessError, RuntimeError) as error:
        # Do not print subprocess arguments/configuration containing fixture passwords.
        print("BLOQUEADO: Redis secure check incomplete (" + type(error).__name__ + ")", flush=True)
        raise SystemExit(1)
