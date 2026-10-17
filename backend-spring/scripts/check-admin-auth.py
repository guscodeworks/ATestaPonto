#!/usr/bin/env python3
"""HTTP checks against the real Spring app, local simulator and disposable MySQL.

Run after ./mvnw -DskipTests package. Requires Java 21, Docker, Node and the
simulator's existing node_modules. Never loads repository .env files.
"""
import hashlib
import hmac
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parents[2]
JAR = ROOT / "backend-spring/target/backend-spring-0.0.1-SNAPSHOT.jar"
COOKIE = "ATESTA_ADMIN_SESSION"


def run(*args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs).stdout.strip()


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None


class Browser:
    def __init__(self):
        self.cookies = http.cookiejar.CookieJar()
        self.http = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPCookieProcessor(self.cookies))

    def request(self, url, method="GET", data=None, headers=None):
        request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
        try:
            response = self.http.open(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.code, response.headers, response.read().decode()

    def sid(self):
        return next((cookie.value for cookie in self.cookies if cookie.name == COOKIE), None)


def wait_until(probe, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if probe():
                return
        except (OSError, subprocess.CalledProcessError):
            pass
        time.sleep(.25)
    raise AssertionError("Temporary service did not become ready")


def main():
    assert JAR.is_file(), "Package backend-spring first"
    assert java21(), "Java 21 required"
    protected = {path: hashlib.sha256(path.read_bytes()).digest()
                 for path in ROOT.rglob(".env") if "node_modules" not in path.parts}
    existing = run("docker", "inspect", "--format", "{{.Id}} {{.State.StartedAt}} {{.RestartCount}}",
                   "mysql-dev", "node-dev")
    container = "atesta-auth-check-" + uuid.uuid4().hex[:12]
    processes = []
    created = False
    passed = 0

    def check(condition, name):
        nonlocal passed
        assert condition, name
        passed += 1
        print("PASS " + name, flush=True)

    with tempfile.TemporaryDirectory(prefix="atesta-admin-http-") as temporary:
        folder = Path(temporary)
        try:
            run("docker", "run", "--rm", "-d", "--name", container,
                "--label", "atestaponto.purpose=admin-auth-check", "--memory", "512m",
                "--tmpfs", "/var/lib/mysql:rw,size=512m", "-p", "127.0.0.1::3306",
                "-e", "MYSQL_ALLOW_EMPTY_PASSWORD=yes", "-e", "MYSQL_DATABASE=auth_check",
                "mysql:8.4", "--innodb-buffer-pool-size=64M")
            created = True
            port = run("docker", "port", container, "3306/tcp").rsplit(":", 1)[1]

            def sql(statement):
                return run("docker", "exec", "-i", container, "mysql", "-uroot", "-N", "auth_check",
                           input=statement)

            wait_until(lambda: sql("SELECT 1") == "1")
            sql((ROOT / "atesta-gateway/database/schema/ponto.sql").read_text())
            sql("""
                INSERT INTO diretorias_ensino(id,nome,codigo) VALUES (1,'Test DRE A','TEST-A'),(2,'Test DRE B','TEST-B');
                INSERT INTO unidades_escolares(id,diretoria_ensino_id,nome,latitude,longitude)
                  VALUES (1,1,'Test School A',0,0),(2,2,'Test School B',0,0);
                INSERT INTO usuarios_administrativos(id,cpf,nome,ativo) VALUES
                  (1,'10000000001','Fictional active',1),(2,'10000000002','Fictional no access',1),
                  (3,'10000000003','Fictional inactive',0),(4,'10000000004','Fictional expired',1),
                  (5,'10000000005','Fictional bad territory',1),(6,'10000000006','Fictional bad role',1),
                  (7,'10000000007','Fictional global',1);
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,unidade_escolar_id,status)
                  VALUES (1,'DIRETOR',1,'ATIVO');
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,unidade_escolar_id,status,data_inicio,data_fim)
                  VALUES (4,'DIRETOR',1,'ATIVO',CURRENT_DATE - INTERVAL 2 DAY,CURRENT_DATE - INTERVAL 1 DAY);
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,status) VALUES (7,'ADMIN_SEDUC','ATIVO');
                -- Corrupt records only in this disposable database, to exercise fail-closed handling.
                ALTER TABLE acessos_administrativos DROP CHECK chk_acessos_escopo;
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,status) VALUES (5,'DIRETOR','ATIVO');
                SET SESSION sql_mode='';
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,status) VALUES (6,'UNKNOWN','ATIVO');
            """)
            spring_port, provider_port = free_port(), free_port()
            app = f"http://127.0.0.1:{spring_port}"
            provider = f"http://127.0.0.1:{provider_port}"
            key, password, client_secret = secrets.token_hex(32), secrets.token_hex(16), secrets.token_hex(16)
            # Only OS execution settings are inherited. No database, Redis or dotenv settings.
            base_env = {name: os.environ[name] for name in ("PATH", "JAVA_HOME", "SystemRoot", "WINDIR")
                        if name in os.environ}
            provider_env = dict(base_env, NODE_ENV="development", REDIS_ENABLED="false", HOST="127.0.0.1",
                GOVBR_FAKE_PORT=str(provider_port), GOVBR_FAKE_ADMIN_LOGIN="adminlocal",
                GOVBR_FAKE_ADMIN_PASSWORD=password, GOVBR_FAKE_ADMIN_SUB="10000000001",
                GOVBR_FAKE_CLIENT_ID="auth-check", GOVBR_FAKE_CLIENT_SECRET=client_secret,
                PONTO_ESCOLAR_REDIRECT_URI=app + "/auth/govbr/callback", PONTO_ESCOLAR_START_URL=app + "/auth/govbr/login")
            accounts = ["SEDUC", "DRE1", "DRE2", "VICE_DIRETOR", "SECRETARIA", "COORDENADOR"]
            for number, account in enumerate(accounts, start=2):
                for field, value in dict(LOGIN=f"user{number}", PASSWORD=password, SUB=f"1000000000{number}",
                                         NAME=f"Fictional {number}", EMAIL=f"fictional{number}@example.invalid").items():
                    provider_env[f"GOVBR_FAKE_ADMIN_{account}_{field}"] = value
            app_env = dict(base_env, DB_HOST="127.0.0.1", DB_PORT=port, DB_NAME="auth_check", DB_USER="root",
                DB_PASSWORD="", INTERNAL_API_SHARED_KEY=key, REDIS_ENABLED="false", ADMIN_SESSION_SECURE="false",
                ADMIN_SESSION_TTL_SECONDS="30", GOVBR_AUTHORIZE_URL=provider + "/fake-govbr/authorize",
                GOVBR_TOKEN_URL=provider + "/fake-govbr/token", GOVBR_USERINFO_URL=provider + "/fake-govbr/userinfo",
                GOVBR_CLIENT_ID="auth-check", GOVBR_CLIENT_SECRET=client_secret,
                GOVBR_REDIRECT_URI=app + "/auth/govbr/callback", GOVBR_LOGOUT_URL="/")
            for name, command, environment in (
                    ("provider", ["node", str(ROOT / "atesta-id/server.js")], provider_env),
                    ("spring", ["java", "-jar", str(JAR), "--server.address=127.0.0.1",
                                f"--server.port={spring_port}"], app_env)):
                log = (folder / (name + ".log")).open("w")
                processes.append(subprocess.Popen(command, cwd=folder, env=environment, stdout=log, stderr=log))
                log.close()
            wait_until(lambda: Browser().request(provider + "/health")[0] == 200)
            wait_until(lambda: Browser().request(app + "/auth/govbr/start")[0] == 302)

            def begin(login="adminlocal"):
                browser = Browser()
                status, headers, _ = browser.request(app + "/auth/govbr/login")
                assert status == 302
                authorize = headers["Location"]
                query = urllib.parse.parse_qs(urllib.parse.urlsplit(authorize).query)
                assert query["code_challenge_method"] == ["S256"] and len(query["code_challenge"][0]) == 43
                assert len(query["state"][0]) == 43 and "access_token" not in query
                provider_browser = Browser()
                data = urllib.parse.urlencode(dict(login=login, password=password)).encode()
                assert provider_browser.request(provider + "/fake-govbr/login", "POST", data,
                    {"Content-Type": "application/x-www-form-urlencoded"})[0] == 200
                status, headers, _ = provider_browser.request(authorize)
                assert status == 302
                return browser, headers["Location"], query

            browser, callback, query = begin()
            before = browser.sid()
            status, headers, body = browser.request(callback)
            check(status == 302 and headers["Location"].endswith("/admin/dashboard"), "valid login and redirect")
            check(browser.sid() is not None and browser.sid() != before, "session fixation protection")
            authenticated_sid = browser.sid()
            cookie = headers.get("Set-Cookie", "")
            check("HttpOnly" in cookie and "SameSite=Lax" in cookie and "Secure" not in cookie,
                  "local cookie HttpOnly/SameSite and absolute Max-Age")
            check("Max-Age=30" in cookie, "configured cookie lifetime")
            check("access_token" not in body + str(headers) and "code_verifier" not in body + str(headers),
                  "no tokens or verifier in browser response")
            check(sql("SELECT ultimo_login_em IS NOT NULL FROM usuarios_administrativos WHERE id=1") == "1",
                  "last login written only in disposable database")
            check(browser.request(app + "/api/admin/nonexistent")[0] == 404, "authenticated request accepted by security")
            check(browser.request(app + "/api/admin/nonexistent", "POST", b"{}")[0] == 403,
                  "unsafe public request without CSRF token denied")
            check(Browser().request(app + "/api/admin/nonexistent")[0] == 401, "missing session denied")
            check(Browser().request(app + "/api/admin/nonexistent", headers={"Cookie": COOKIE + "=invalid"})[0] == 401,
                  "invalid session denied")
            check(Browser().request(app + "/api/admin/nonexistent?admin_id=1", headers={"Authorization": "Bearer forged"})[0] == 401,
                  "browser identity and bearer token do not grant administrative access")
            for user, description in ((2, "no access"), (3, "inactive identity"), (4, "expired access"),
                                      (5, "missing territory"), (6, "unknown role")):
                denied, denied_callback, _ = begin(f"user{user}")
                check(denied.request(denied_callback)[0] == 403, description + " denied at login")
                check(denied.request(app + "/api/admin/nonexistent")[0] == 401, description + " has no authorized session")
            wrong, wrong_callback, _ = begin()
            parts = urllib.parse.urlsplit(wrong_callback)
            values = urllib.parse.parse_qs(parts.query)
            values["state"] = ["incorrect"]
            check(wrong.request(urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(values, doseq=True))))[0] == 401,
                  "incorrect state denied")
            check(wrong.request(wrong_callback)[0] == 400, "callback cannot reuse consumed state")
            duplicate, duplicate_callback, _ = begin()
            check(duplicate.request(duplicate_callback + "&state=duplicate")[0] == 400, "duplicate state denied")
            injected, injected_callback, _ = begin()
            check(injected.request(injected_callback + "&access_token=injected")[0] == 400, "implicit token injection denied")
            pkce_browser, pkce_callback, _ = begin()
            code = urllib.parse.parse_qs(urllib.parse.urlsplit(pkce_callback).query)["code"][0]
            token_form = urllib.parse.urlencode(dict(grant_type="authorization_code", code=code,
                client_id="auth-check", client_secret=client_secret, redirect_uri=app + "/auth/govbr/callback",
                code_verifier="x" * 43)).encode()
            check(Browser().request(provider + "/fake-govbr/token", "POST", token_form,
                  {"Content-Type": "application/x-www-form-urlencoded"})[0] == 400, "provider rejects wrong PKCE verifier")
            check(pkce_browser.request(pkce_callback)[0] == 502, "consumed code fails closed without session")
            check(pkce_browser.request(app + "/api/admin/nonexistent")[0] == 401,
                  "provider error leaves no administrative session")
            # Valid school A session cannot call any school B internal operation.
            check(browser.request(app + "/internal/escolas/2")[0] == 401, "cross-territory internal access denied with admin cookie")
            check(browser.request(app + "/internal/escolas/1")[0] == 401, "own-territory internal route also requires HMAC")
            for path in ("/internal/auth/admin/context", "/internal;test/auth/admin/context", "/%69nternal/auth/admin/context"):
                check(browser.request(app + path, "POST", b'{"admin_id":1}',
                    {"Content-Type": "application/json"})[0] == 401, "unsigned internal request denied: " + path)
            target = "/internal/auth/admin/context"
            payload = b'{"admin_id":1}'
            timestamp, request_id = str(int(time.time())), str(uuid.uuid4())
            canonical = "\n".join(("POST", target, timestamp, request_id, hashlib.sha256(payload).hexdigest()))
            signed_headers = {"Content-Type": "application/json", "X-Internal-Timestamp": timestamp,
                "X-Internal-Request-Id": request_id,
                "X-Internal-Signature": hmac.new(key.encode(), canonical.encode(), hashlib.sha256).hexdigest()}
            check(Browser().request(app + target, "POST", payload, signed_headers)[0] == 200, "existing HMAC contract preserved")
            check(Browser().request(app + target, "POST", payload, signed_headers)[0] == 401, "internal replay denied")
            altered = dict(signed_headers, **{"X-Internal-Request-Id": str(uuid.uuid4())})
            check(Browser().request(app + target, "POST", payload, altered)[0] == 401,
                  "tampered internal signature denied")
            check(browser.request(app + "/auth/govbr/logout", "POST", b"", {"Origin": "https://evil.invalid"})[0] == 403,
                  "cross-origin logout denied")
            check(browser.request(app + "/auth/govbr/logout", "POST", b"")[0] == 403, "logout without source denied")
            check(browser.request(app + "/auth/govbr/logout")[0] == 403, "GET cannot perform logout")
            check(browser.request(app + "/api/admin/nonexistent")[0] == 404,
                  "rejected logout preserves administrative session")
            status, headers, _ = browser.request(app + "/auth/govbr/logout", "POST", b"", {"Origin": app})
            check(status == 302 and headers["Location"].endswith("/"), "same-origin logout redirect")
            check("Max-Age=0" in headers.get("Set-Cookie", ""), "logout expires cookie")
            check(browser.request(app + "/api/admin/nonexistent")[0] == 401, "logout destroys authorization")
            check(Browser().request(app + "/api/admin/nonexistent", headers={"Cookie": COOKIE + "=" + authenticated_sid})[0] == 401,
                  "logged-out session identifier cannot be reused")
            check(Browser().request(app + "/api/admin/nonexistent", headers={"Cookie": COOKIE + "=" + (before or "")})[0] == 401,
                  "pre-login session cannot be reused")
            revoked, revoked_callback, _ = begin()
            assert revoked.request(revoked_callback)[0] == 302
            sql("UPDATE acessos_administrativos SET status='REVOGADO' WHERE usuario_administrativo_id=1")
            check(revoked.request(app + "/api/admin/nonexistent")[0] == 401, "access revoked after login denied on next request")
            sql("UPDATE acessos_administrativos SET status='ATIVO' WHERE usuario_administrativo_id=1")
            disabled, disabled_callback, _ = begin()
            assert disabled.request(disabled_callback)[0] == 302
            sql("UPDATE usuarios_administrativos SET ativo=0 WHERE id=1")
            check(disabled.request(app + "/api/admin/nonexistent")[0] == 401,
                  "identity disabled after login denied on next request")
            sql("UPDATE usuarios_administrativos SET ativo=1 WHERE id=1")
            global_admin, global_callback, _ = begin("user7")
            check(global_admin.request(global_callback)[0] == 302
                  and global_admin.request(app + "/api/admin/nonexistent")[0] == 404,
                  "explicit valid ADMIN_SEDUC access accepted")
            referer, referer_callback, _ = begin()
            assert referer.request(referer_callback)[0] == 302
            check(referer.request(app + "/auth/govbr/logout", "POST", b"", {"Referer": app + "/admin/dashboard"})[0] == 302,
                  "same-origin Referer logout remains compatible")
            unavailable, unavailable_callback, _ = begin()
            assert unavailable.request(unavailable_callback)[0] == 302
            sql("RENAME TABLE acessos_administrativos TO acessos_admin_unavailable")
            try:
                check(unavailable.request(app + "/api/admin/nonexistent")[0] == 401,
                      "JDBC revalidation failure denies access")
            finally:
                sql("RENAME TABLE acessos_admin_unavailable TO acessos_administrativos")
            expired, expired_callback, _ = begin()
            assert expired.request(expired_callback)[0] == 302
            expired_sid = expired.sid()
            for _ in range(16):
                time.sleep(2)
                expired.request(app + "/api/admin/nonexistent", headers={"Cookie": COOKIE + "=" + expired_sid})
            check(expired.request(app + "/api/admin/nonexistent")[0] == 401, "absolute expiry despite continued activity")
            check(Browser().request(app + "/api/admin/nonexistent", headers={"Cookie": COOKIE + "=" + expired_sid})[0] == 401,
                  "server rejects expired session even when cookie is replayed")
            secure_port = free_port()
            secure_app = f"http://127.0.0.1:{secure_port}"
            secure_env = dict(app_env, ADMIN_SESSION_SECURE="true",
                GOVBR_AUTHORIZE_URL=provider.replace("http:", "https:") + "/fake-govbr/authorize",
                GOVBR_TOKEN_URL=provider.replace("http:", "https:") + "/fake-govbr/token",
                GOVBR_USERINFO_URL=provider.replace("http:", "https:") + "/fake-govbr/userinfo",
                GOVBR_REDIRECT_URI=secure_app.replace("http:", "https:") + "/auth/govbr/callback")
            with (folder / "secure-spring.log").open("w") as log:
                processes.append(subprocess.Popen(["java", "-jar", str(JAR), "--server.address=127.0.0.1",
                    f"--server.port={secure_port}"], cwd=folder, env=secure_env, stdout=log, stderr=log))
            wait_until(lambda: Browser().request(secure_app + "/auth/govbr/start")[0] == 302)
            status, headers, _ = Browser().request(secure_app + "/auth/govbr/login")
            check(status == 302 and "Secure" in headers.get("Set-Cookie", "")
                  and "HttpOnly" in headers.get("Set-Cookie", "")
                  and "SameSite=Lax" in headers.get("Set-Cookie", ""), "HTTPS configuration sets Secure cookie")
            for process in processes:
                assert process.poll() is None, "Temporary service stopped unexpectedly"
            for log_path in folder.glob("*.log"):
                logs = log_path.read_text()
                check(all(secret not in logs for secret in (key, password, client_secret, code)), "no secrets in " + log_path.stem + " logs")
            print(f"PASS {passed} HTTP/integration checks; no public domain resource authorization claimed", flush=True)
        except Exception:
            for log_path in folder.glob("*.log"):
                lines = log_path.read_text().splitlines()[-35:]
                sanitized = "\n".join(lines)
                for value in (locals().get("key"), locals().get("password"), locals().get("client_secret")):
                    if value:
                        sanitized = sanitized.replace(value, "[redacted]")
                print(log_path.stem + " diagnostic:\n" + sanitized, flush=True)
            raise
        finally:
            for process in reversed(processes):
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
            if created:
                run("docker", "rm", "-f", container)
            assert existing == run("docker", "inspect", "--format", "{{.Id}} {{.State.StartedAt}} {{.RestartCount}}",
                                   "mysql-dev", "node-dev"), "Existing containers changed"
            assert all(path.exists() and hashlib.sha256(path.read_bytes()).digest() == digest
                       for path, digest in protected.items()), ".env changed"
            print("Temporary resources removed; mysql-dev, node-dev and .env preserved", flush=True)


def java21():
    result = subprocess.run(["java", "-version"], capture_output=True, text=True, check=True)
    return 'version "21.' in result.stderr


if __name__ == "__main__":
    main()
