#!/usr/bin/env python3
"""HTTP direto no JAR real, MySQL/Redis descartaveis e Gov.br local simulado.

Nao carrega .env, nao inicia Express e nao altera mysql-dev/node-dev.
Execute apos JAVA_HOME=<Java 21> ./mvnw -o -DskipTests package.
"""
import base64
import datetime as dt
import hashlib
import hmac
import http.server
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.parse
import uuid

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("pages_support", Path(__file__).with_name("check-public-schools.py"))
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)
Browser, run, wait_until = S.Browser, S.run, S.wait_until
ROOT, JAR = S.ROOT, S.JAR
REPORT = ROOT / "backend-spring/HOMOLOGACAO-PAGINAS-SPRING.md"
PAGES = {
    "dashboard": ("dashboard.html", {1, 2, 3, 4, 5, 6}),
    "diretorias": ("departments.html", {2}),
    "escolas": ("schools.html", {1, 2, 3, 4, 5, 6}),
    "escolas/nova": ("register-school.html", {3}),
    "funcionario": ("employees.html", {1, 3, 4, 5, 6}),
    "funcionarios": ("employees.html", {1, 3, 4, 5, 6}),
    "funcionarios/novo": ("register-employee.html", {1, 4, 5}),
    "pontos": ("daily-points.html", {1, 3, 4, 5, 6}),
    "pontos-do-dia": ("daily-points.html", {1, 3, 4, 5, 6}),
    "relatorios": ("reports.html", {1, 2, 3, 4, 5, 6}),
    "configuracoes": ("settings.html", {1, 2, 3, 4, 5, 6}),
}


def main():
    results, processes, containers, private = [], [], [], []
    current, requests = "infra", 0
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    protected = {p: hashlib.sha256(p.read_bytes()).digest() for p in ROOT.rglob(".env*")
                 if p.is_file() and "node_modules" not in p.parts and ".git" not in p.parts}
    originals = {p: hashlib.sha256(p.read_bytes()).digest()
                 for directory in ("atesta-gateway/views", "atesta-gateway/public")
                 for p in (ROOT / directory).rglob("*") if p.is_file()}
    baseline = run(*S.SNAPSHOT)
    suffix = uuid.uuid4().hex[:10]
    mysql, redis_name = "atesta-pages-mysql-" + suffix, "atesta-pages-redis-" + suffix
    namespace = "atestaponto:pages-check-" + suffix
    key, session_secret, jwt_secret, provider_secret, password = [secrets.token_hex(32) for _ in range(5)]
    private.extend((key, session_secret, jwt_secret, provider_secret, password))

    def safe(value):
        value = str(value)
        for secret in sorted(private, key=len, reverse=True):
            value = value.replace(secret, "[redacted]")
        return value[:1600].replace("\n", " ").replace("|", "/")

    def record(status, description):
        results.append((status, current, safe(description)))
        print(status + " " + current + ": " + safe(description), flush=True)

    def check(ok, description):
        if not ok:
            raise AssertionError(description)
        record("PASSOU", description)

    def scenario(group, action):
        nonlocal current
        current = group
        try:
            action()
        except Exception as failure:
            location = traceback.extract_tb(failure.__traceback__)[-1]
            record("FALHOU", f"{type(failure).__name__}: {failure} ({Path(location.filename).name}:{location.lineno})")

    with tempfile.TemporaryDirectory(prefix="atesta-pages-http-") as temporary:
        folder = Path(temporary)
        provider = http.server.ThreadingHTTPServer(("127.0.0.1", 0), S.Provider)
        provider.daemon_threads = True
        S.Provider.secret = provider_secret
        threading.Thread(target=provider.serve_forever, daemon=True).start()
        try:
            check(S.SUPPORT.java21() and JAR.is_file(), "Java 21 e JAR empacotado disponiveis")
            for name, port, options, command in (
                (mysql, "3306", ["--memory", "512m", "--tmpfs", "/var/lib/mysql:rw,size=512m",
                                "-e", "MYSQL_ALLOW_EMPTY_PASSWORD=yes", "-e", "MYSQL_DATABASE=pages_check"],
                 ["mysql:8.4", "--innodb-buffer-pool-size=64M"]),
                (redis_name, "6379", ["--memory", "128m", "--tmpfs", "/data:rw,size=64m"],
                 ["redis:7-alpine", "redis-server", "--save", "", "--appendonly", "no"])):
                run("docker", "run", "--rm", "-d", "--name", name, "--label",
                    "atestaponto.purpose=protected-pages-homologation", "-p", "127.0.0.1::" + port, *options, *command)
                containers.append(name)
            db_port = run("docker", "port", mysql, "3306/tcp").rsplit(":", 1)[1]
            redis_port = run("docker", "port", redis_name, "6379/tcp").rsplit(":", 1)[1]

            def sql(statement):
                return run("docker", "exec", "-i", mysql, "mysql", "-uroot", "-N", "pages_check", input=statement)

            def redis(*command):
                return run("docker", "exec", redis_name, "redis-cli", "--raw", *command)

            def ready():
                try:
                    return sql("SELECT 1") == "1" and redis("PING") == "PONG"
                except subprocess.CalledProcessError:
                    return False

            wait_until(ready)
            sql((ROOT / "atesta-gateway/database/schema/ponto.sql").read_text())
            hash_script = "process.stdout.write(require(process.argv[1]).hashSync(require('fs').readFileSync(0,'utf8'),10))"
            password_hash = run("node", "-e", hash_script, str(ROOT / "atesta-gateway/node_modules/bcrypt"), input=password)
            private.append(password_hash)
            sql("""
                INSERT INTO diretorias_ensino(id,nome,codigo) VALUES
                  (1,'Fictional DRE A','PAGES-A'),(2,'Fictional DRE B','PAGES-B'),(3,'Fictional empty DRE','PAGES-E');
                INSERT INTO unidades_escolares(id,diretoria_ensino_id,nome,latitude,longitude) VALUES
                  (1,1,'Fictional school A',0,0),(2,2,'Fictional school B',0,0);
                INSERT INTO cargos(id,cargo) VALUES(1,'FUNCIONARIO');
            """)
            for i in range(1, 16):
                sql(f"INSERT INTO usuarios_administrativos(id,cpf,nome,email,ativo) VALUES "
                    f"({i},'1000000{i:04d}','Fictional admin {i}','admin{i}@example.invalid',1)")
            sql("""
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,unidade_escolar_id,status) VALUES
                  (1,'DIRETOR',1,'ATIVO'),(4,'VICE_DIRETOR',1,'ATIVO'),(5,'SECRETARIA',1,'ATIVO'),
                  (6,'COORDENADOR',1,'ATIVO'),(9,'DIRETOR',1,'ATIVO'),(10,'DIRETOR',1,'ATIVO'),
                  (11,'DIRETOR',1,'ATIVO'),(12,'DIRETOR',1,'ATIVO'),(13,'DIRETOR',1,'ATIVO'),
                  (14,'DIRETOR',1,'ATIVO'),(15,'DIRETOR',1,'ATIVO');
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,status) VALUES
                  (2,'ADMIN_SEDUC','ATIVO'),(15,'ADMIN_SEDUC','ATIVO');
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,diretoria_ensino_id,status) VALUES
                  (3,'ADMIN_DIRETORIA',1,'ATIVO'),(7,'ADMIN_DIRETORIA',3,'ATIVO'),(8,'ADMIN_DIRETORIA',2,'ATIVO');
            """)
            for i, cpf in ((1, "52998224725"), (2, "11144477735")):
                sql(f"""INSERT INTO funcionarios(id,cpf,nome,email,ativo) VALUES
                  ({i},'{cpf}','Fictional employee {i}','employee{i}@example.invalid',1);
                  INSERT INTO login_funcionario(funcionario_id,senha_hash,primeiro_acesso) VALUES ({i},'{password_hash}',0);
                  INSERT INTO vinculos_funcionais(id,funcionario_id,unidade_escolar_id,cargo_id,horario_entrada,
                    horario_saida_almoco,horario_volta_almoco,horario_saida,data_inicio,status)
                  VALUES ({i},{i},{i},1,'08:00','12:00','13:00','17:00',CURRENT_DATE,'ATIVO');""")
            app = "http://127.0.0.1:" + str(S.free_port())
            govbr = "http://127.0.0.1:" + str(provider.server_port)
            base = {k: os.environ[k] for k in ("PATH", "JAVA_HOME", "SystemRoot", "WINDIR") if k in os.environ}
            environment = dict(base, NODE_ENV="development", DB_HOST="127.0.0.1", DB_PORT=db_port, DB_NAME="pages_check",
                DB_USER="root", DB_PASSWORD="", REDIS_ENABLED="true", REDIS_HOST="127.0.0.1", REDIS_PORT=redis_port,
                REDIS_NAMESPACE=namespace, SESSION_SECRET=session_secret, JWT_SECRET=jwt_secret, INTERNAL_API_SHARED_KEY=key,
                GOVBR_AUTHORIZE_URL=govbr+"/authorize", GOVBR_TOKEN_URL=govbr+"/token", GOVBR_USERINFO_URL=govbr+"/userinfo",
                GOVBR_CLIENT_ID="pages-check", GOVBR_CLIENT_SECRET=provider_secret, GOVBR_REDIRECT_URI=app+"/auth/govbr/callback",
                GOVBR_LOGOUT_URL="/", ADMIN_SESSION_SECURE="false", ADMIN_SESSION_TTL_SECONDS="600",
                MAIL_ENABLED="false", BCRYPT_SALT_ROUNDS="10", LOGIN_FAILURE_DELAY_MS="0", CORS_ORIGIN=app)
            log_path = folder / "spring.log"
            with log_path.open("w") as log:
                spring = subprocess.Popen(["java", "-Djava.io.tmpdir="+str(folder), "-jar", str(JAR),
                    "--server.address=127.0.0.1", "--server.port="+app.rsplit(":", 1)[1]],
                    cwd=folder, env=environment, stdout=log, stderr=log)
            processes.append(spring)
            wait_until(lambda: spring.poll() is not None or Browser().request(app+"/auth/govbr/start")[0] == 302)
            if spring.poll() is not None:
                raise RuntimeError("Spring encerrou: " + safe(log_path.read_text()[-5000:]))
            check(True, "JAR Spring real com JDBC/MySQL 8.4, Redis 7 e Gov.br/PKCE local; Express nao iniciado")

            def request(browser, path, expected, method="GET", data=None, headers=None):
                nonlocal requests
                requests += 1
                status, h, raw = browser.request(app+path, method, None if data is None else json.dumps(data).encode(),
                    {"Origin": app, "Content-Type": "application/json", **(headers or {})})
                assert status == expected, f"{method} {path.split('?')[0]}: esperado {expected}, recebido {status}"
                return h, raw

            def admin_login(account, expected=302):
                b = Browser()
                h, _ = request(b, "/auth/govbr/login", 302)
                old = b.sid()
                q = urllib.parse.parse_qs(urllib.parse.urlsplit(h["Location"]).query)
                assert q["code_challenge_method"] == ["S256"] and len(q["code_challenge"][0]) == 43
                _, redirect, _ = Browser().request(h["Location"], headers={"X-Fixture-Account": str(account)})
                status, headers, body = b.request(redirect["Location"])
                assert status == expected, f"OAuth fixture {account}: esperado {expected}, recebido {status}"
                if expected == 302:
                    assert headers["Location"].endswith("/admin/dashboard") and b.sid() != old
                    assert "access_token" not in str(headers)+body
                    private.append(b.sid())
                return b

            def admin_key(b):
                return namespace+":admin:spring-session:sessions:"+base64.b64decode(b.sid()).decode()

            def qr_key(b):
                value = next(c.value for c in b.cookies if c.name == "ponto_qr_acesso")
                decoded = urllib.parse.unquote(value)
                sid = decoded[2:decoded.rindex(".")]
                return namespace+":ponto:session:"+hashlib.sha256(sid.encode()).hexdigest()

            def html(b, path, file, root="admin"):
                h, body = request(b, path, 200)
                original = ROOT / "atesta-gateway/views" / root / file if root else ROOT / "atesta-gateway/views" / file
                assert body.encode() == original.read_bytes(), "HTML divergente: "+path.split("?")[0]
                assert h.get("Content-Type", "").lower() == "text/html;charset=utf-8", "Content-Type HTML divergente"
                assert "no-store" in h.get("Cache-Control", ""), "HTML cacheavel"
                return h

            def denied(b, path, expected=403):
                _, body = request(b, path, expected)
                assert not any(body.encode() == (ROOT/"atesta-gateway/views/admin"/file).read_bytes()
                               for file, _ in PAGES.values()), "HTML protegido vazou"

            def api(b, path, expected=200, method="GET", data=None, headers=None):
                h, raw = request(b, path, expected, method, data, headers)
                assert "application/json" in h.get("Content-Type", "")
                assert "no-store" in h.get("Cache-Control", "")
                result = json.loads(raw)
                assert result.get("success") is (expected < 400)
                return result.get("data", result), h

            def employee_login(b, employee=1, expected=200, extra=None):
                return api(b, "/api/pontos/login", expected, "POST",
                    {"email": f"employee{employee}@example.invalid", "senha": password, **(extra or {})})

            def generate_qr(unit=1):
                path, body = "/internal/escolas/qr/gerar", {"unidade_escolar_id": unit, "base_url": app}
                raw = json.dumps(body).encode()
                ts, rid = str(int(time.time())), str(uuid.uuid4())
                canonical = "\n".join(("POST", path, ts, rid, hashlib.sha256(raw).hexdigest()))
                signature = hmac.new(key.encode(), canonical.encode(), hashlib.sha256).hexdigest()
                h = {"X-Internal-Timestamp": ts, "X-Internal-Request-Id": rid, "X-Internal-Signature": signature}
                _, reply = request(Browser(), path, 200, "POST", body, h)
                result = json.loads(reply)
                token = urllib.parse.parse_qs(urllib.parse.urlsplit(result["qrCode"]["url"]).query)["qr"][0]
                private.append(token)
                return token, h, body

            def open_qr(b, token):
                h = html(b, "/ponto/acessar?qr="+urllib.parse.quote(token, safe=""), "index.html", "")
                assert h.get("Referrer-Policy") == "no-referrer"
                values = h.get_all("Set-Cookie", [])
                assert any("Max-Age=900" in c and "HttpOnly" in c and "SameSite=Lax" in c for c in values)
                assert all(c.startswith("ponto_qr_acesso=") for c in values), "Cookie administrativo alterado"
                return h

            users = {i: admin_login(i) for i in range(1, 9)}
            check(True, "Gov.br simulado: oito logins reais Authorization Code/PKCE, sessao Redis e rotacao de ID")

            def admin_pages():
                for i in range(1, 7):
                    allowed = blocked = 0
                    for route, (file, profiles) in PAGES.items():
                        for slash in ("", "/"):
                            path = "/admin/"+route+slash
                            if i in profiles:
                                html(users[i], path, file)
                                allowed += 1
                            else:
                                denied(users[i], path)
                                blocked += 1
                    check(True, f"Perfil fixture {i}: {allowed} HTMLs autorizados identicos/UTF-8/no-store; {blocked} negados sem HTML")
                for route in PAGES:
                    denied(Browser(), "/admin/"+route, 302)
                check(True, "Todas as paginas administrativas negam navegador sem sessao antes do HTML")
                for path in ("/admin", "/admin/", "/admin/index", "/admin/index/"):
                    h, _ = request(users[1], path, 302)
                    assert urllib.parse.urlsplit(h["Location"]).path == "/admin/dashboard"
                    denied(Browser(), path, 302)
                for i in range(1, 7):
                    for slash in ("", "/"):
                        path = "/admin/registrar-funcionario"+slash
                        if i in (1, 4, 5):
                            h, _ = request(users[i], path, 302)
                            assert urllib.parse.urlsplit(h["Location"]).path == "/admin/funcionarios/novo"
                        else:
                            denied(users[i], path)
                h, _ = request(Browser(), "/admin/login", 302)
                assert urllib.parse.urlsplit(h["Location"]).path == "/auth/govbr/login"
                check(True, "Aliases singular/plural, pontos e redirects index/cadastro/login preservados e protegidos")
                for path in ("/admin-pages/dashboard.html", "/static/admin-pages/dashboard.html",
                             "/admin/dashboard.html", "/admin/../admin-pages/dashboard.html"):
                    status, headers, body = users[1].request(app+path)
                    assert status in (302, 400, 403, 404), f"Recurso privado HTTP {status}: {path}"
                    if status == 302:
                        assert urllib.parse.urlsplit(headers["Location"]).path == "/auth/govbr/login"
                    assert body.encode() != (ROOT/"atesta-gateway/views/admin/dashboard.html").read_bytes()
                request(users[1], "/admin/dashboard", 200, "HEAD")
                request(Browser(), "/admin/dashboard", 302, "HEAD")
                check(True, "HEAD protegido e URLs diretas/travessia nao entregam recursos privados")
            scenario("paginas-administrativas", admin_pages)

            def territory():
                for user, expected in ((1, {1}), (3, {1}), (8, {2}), (2, {1, 2})):
                    data, _ = api(users[user], "/api/admin/escolas")
                    assert {row["id"] for row in data["items"]} == expected, f"Escopo base da fixture {user} divergente"
                    injected, _ = api(users[user], "/api/admin/escolas?unidade_escolar_id=999&diretoria_ensino_id=2")
                    actual = {row["id"] for row in injected["items"]}
                    assert actual == expected.intersection({2}), f"Filtro ampliou escopo da fixture {user}"
                check(True, "Territorio JDBC: unidade propria, DRE A/B e global explicito; IDs do navegador nao ampliam escopo")
                denied(users[2], "/admin/funcionarios?perfil=DIRETOR&unidade_escolar_id=1")
                denied(users[6], "/admin/funcionarios/novo?capacidade=funcionario.criar")
                mixed = admin_login(15)
                html(mixed, "/admin/funcionarios", "employees.html")
                data, _ = api(mixed, "/api/admin/funcionarios")
                assert {row["id"] for row in data["items"]} == {1}
                check(True, "Capacidade no mesmo acesso: SEDUC+diretor nao transforma listagem de funcionarios em global")
                for path in ("/admin/escolas", "/admin/funcionarios", "/admin/pontos", "/admin/relatorios"):
                    denied(users[7], path)
                html(users[7], "/admin/escolas/nova", "register-school.html")
                check(True, "DRE sem escolas: paginas de colecoes negadas; cadastro da primeira escola autorizado pela DRE")
                moved = admin_login(14)
                sql("UPDATE acessos_administrativos SET unidade_escolar_id=2 WHERE usuario_administrativo_id=14")
                html(moved, "/admin/escolas", "schools.html")
                data, _ = api(moved, "/api/admin/escolas")
                assert {row["id"] for row in data["items"]} == {2}
                check(True, "Mudanca territorial persistida revalidada na sessao existente, sem escopo antigo")
            scenario("territorio-capacidades", territory)

            def sessions():
                for account, mutation in (
                    (9, "UPDATE usuarios_administrativos SET ativo=0 WHERE id=9"),
                    (10, "UPDATE acessos_administrativos SET status='REVOGADO' WHERE usuario_administrativo_id=10"),
                    (11, "UPDATE acessos_administrativos SET data_inicio=CURRENT_DATE-INTERVAL 2 DAY, data_fim=CURRENT_DATE-INTERVAL 1 DAY WHERE usuario_administrativo_id=11")):
                    b = admin_login(account)
                    stored_key = admin_key(b)
                    sql(mutation)
                    denied(b, "/admin/dashboard", 302)
                    assert redis("EXISTS", stored_key) == "0"
                admin_login(9, 403)
                admin_login(10, 403)
                admin_login(11, 403)
                check(True, "Inativo, acesso revogado e vigencia vencida negam HTML/login e invalidam sessao no Redis")
                b = admin_login(12)
                stored_key = admin_key(b)
                redis("PEXPIRE", stored_key, "1")
                time.sleep(.03)
                denied(b, "/admin/configuracoes", 302)
                check(True, "Sessao expirada no Redis negada antes do HTML")
                b = admin_login(13)
                source = folder/"ExpiredInstant.java"
                source.write_text("import java.io.*; import java.time.*; public class ExpiredInstant { "
                    "public static void main(String[] args) throws Exception { var b=new ByteArrayOutputStream(); "
                    "var o=new ObjectOutputStream(b); o.writeObject(Instant.EPOCH); o.close(); System.out.write(b.toByteArray()); }}")
                serialized = subprocess.run(["java", str(source)], env=base, capture_output=True, check=True).stdout
                subprocess.run(["docker", "exec", "-i", redis_name, "redis-cli", "-x", "HSET", admin_key(b),
                                "sessionAttr:ADMIN_EXPIRES_AT"], input=serialized, capture_output=True, check=True)
                denied(b, "/admin/dashboard", 302)
                check(True, "Expiracao absoluta ADMIN_EXPIRES_AT tambem negada com chave Redis ainda vigente")
            scenario("sessoes", sessions)

            def qr_flow():
                for path in ("/", "/login", "/login/", "/ponto/acessar", "/ponto/acessar/"):
                    h = html(Browser(), path, "index.html", "")
                    assert h.get("Referrer-Policy") == "no-referrer"
                for path, target in (("/home", "/"), ("/home/", "/"), ("/ponto", "/ponto/acessar"),
                                     ("/ponto/", "/ponto/acessar"), ("/bater-ponto", "/ponto/acessar"),
                                     ("/bater-ponto/", "/ponto/acessar")):
                    h, _ = request(Browser(), path+"?qr=discarded", 302)
                    assert h["Location"] == target
                result, _ = employee_login(Browser(), 2, extra={"unidade_escolar_id": 1})
                assert result["funcionario"]["id"] == 2
                check(True, "Acesso normal sem QR: HTML original/UTF-8/no-store e redirects relativos; unidade enviada nao autoriza")
                token, signature, body = generate_qr()
                request(Browser(), "/internal/escolas/qr/gerar", 401, "POST", body, signature)
                request(Browser(), "/internal/escolas/qr/gerar", 401, "POST", body)
                check(True, "Geracao QR pelo HMAC real: assinatura exigida e replay rejeitado")
                b = Browser()
                open_qr(b, token)
                stored_key = qr_key(b)
                stored = json.loads(redis("GET", stored_key))
                assert stored["funcionario_qr"] == {"token": token}
                assert stored["cookie"]["originalMaxAge"] == 900000 and 890000 < int(redis("PTTL", stored_key)) <= 900000
                assert 890 < (dt.datetime.fromisoformat(stored["cookie"]["expires"].replace("Z", "+00:00")) - dt.datetime.now(dt.timezone.utc)).total_seconds() <= 900
                cookie = next(c.value for c in b.cookies if c.name == "ponto_qr_acesso")
                raw = urllib.parse.unquote(cookie)
                sid, mac = raw[2:].rsplit(".", 1)
                assert hmac.compare_digest(mac, base64.b64encode(hmac.new(session_secret.encode(), sid.encode(), hashlib.sha256).digest()).decode().rstrip("="))
                check(True, "GET QR valida Redis e cria somente token em contexto assinado; cookie separado HttpOnly/SameSite; TTL absoluto 15 minutos")
                result, _ = employee_login(b, extra={"unidade_escolar_id": 2})
                assert result["funcionario"]["id"] == 1
                redis("PEXPIRE", stored_key, "200000")
                employee_login(b)
                assert int(redis("PTTL", stored_key)) <= 200000
                sql("UPDATE login_funcionario SET ultimo_login_em=NULL WHERE funcionario_id=2")
                employee_login(b, 2, 403, {"unidade_escolar_id": 1})
                assert sql("SELECT ultimo_login_em IS NULL FROM login_funcionario WHERE funcionario_id=2") == "1"
                check(True, "POST QR revalida vinculo real, ignora unidade do navegador, nao renova TTL e nega escola divergente antes de gravar ultimo login")
                sql("UPDATE vinculos_funcionais SET unidade_escolar_id=2 WHERE funcionario_id=1")
                try:
                    employee_login(b, 1, 403, {"unidade_escolar_id": 1})
                finally:
                    sql("UPDATE vinculos_funcionais SET unidade_escolar_id=1 WHERE funcionario_id=1")
                check(True, "Vinculo alterado entre GET e POST e reconsultado e negado no login")
                generate_qr()
                result, h = employee_login(b, 1, 403)
                assert "QR Code invalido ou revogado" in result["error"]["message"]
                assert "Max-Age=0" in h.get("Set-Cookie", "")
                denied(Browser(), "/ponto/acessar?qr="+token)
                for query in ("qr=", "qr=bad", "qr="+token+"&qr="+token):
                    denied(Browser(), "/ponto/acessar?"+query)
                check(True, "QR revogado apos abrir pagina nega POST; invalido/vazio/duplicado/revogado nega GET sem HTML")
                for path in ("/", "/login", "/ponto/acessar"):
                    value, _, _ = generate_qr()
                    browser = Browser()
                    open_qr(browser, value)
                    stale = qr_key(browser)
                    html(browser, path, "index.html", "")
                    assert redis("EXISTS", stale) == "0" and not any(c.name == "ponto_qr_acesso" for c in browser.cookies)
                    employee_login(browser, 2)
                check(True, "Inicio/login/acesso sem QR removem contexto residual no Redis e cookie; login normal deixa de impor escola anterior")
                value, _, _ = generate_qr()
                browser = Browser()
                open_qr(browser, value)
                stored_key = qr_key(browser)
                redis("PEXPIRE", stored_key, "1")
                time.sleep(.03)
                _, h = employee_login(browser, 2)
                assert "Max-Age=0" in h.get("Set-Cookie", "")
                check(True, "TTL expirado limpa cookie e retorna ao login normal, sem autorizacao escolar residual")
                browser = Browser()
                html(browser, "/ponto/acessar?unidade_escolar_id=1", "index.html", "")
                assert not any(c.name == "ponto_qr_acesso" for c in browser.cookies)
                employee_login(browser, 2, extra={"qr": value, "unidade_escolar_id": 1})
                check(True, "Unidade/QR somente no corpo do login nao criam contexto autorizado")
            scenario("navegacao-qr", qr_flow)

            def isolation():
                b = admin_login(1)
                original_admin, stored_admin = b.sid(), admin_key(b)
                value, _, _ = generate_qr()
                open_qr(b, value)
                assert b.sid() == original_admin and redis("EXISTS", stored_admin) == "1"
                employee_login(b)
                html(b, "/admin/dashboard", "dashboard.html")
                html(b, "/login", "index.html", "")
                assert b.sid() == original_admin
                html(b, "/admin/dashboard", "dashboard.html")
                check(True, "GET QR, login de funcionario e limpeza QR preservam sessao/cookie administrativo existente")
                qr_only = Browser()
                open_qr(qr_only, value)
                denied(qr_only, "/admin/dashboard", 302)
                api(qr_only, "/api/admin/auth/me", 401)
                api(qr_only, "/api/pontos/hoje", 401)
                check(True, "Cookie QR sozinho nao autentica admin nem consulta ponto; cookies nao se substituem")
                admin_only = admin_login(1)
                api(admin_only, "/api/pontos/hoje", 401)
                result, _ = employee_login(qr_only)
                api(Browser(), "/api/admin/auth/me", 401, headers={"Authorization": "Bearer "+result["token"]})
                check(True, "Sessao admin nao autentica funcionario; JWT de funcionario nao autentica admin")
                open_qr(b, value)
                key_before = qr_key(b)
                request(b, "/auth/govbr/logout", 302, "POST")
                assert redis("EXISTS", key_before) == "1"
                employee_login(b)
                denied(b, "/admin/dashboard", 302)
                check(True, "Logout administrativo invalida admin e preserva contexto QR independente")
            scenario("isolamento-cookies", isolation)

            def dependencies():
                assets = set()
                browser = admin_login(1)
                for p in [ROOT/"atesta-gateway/views/index.html", *(ROOT/"atesta-gateway/views/admin").glob("*.html")]:
                    assets.update(path.split("?")[0] for path in re.findall(r'(?:src|href)="(/[^"]+)"', p.read_text())
                                  if path.startswith(("/assets/", "/img/", "/icons/")))
                for path in sorted(assets):
                    status, _, _ = browser.request(app+path)
                    record("BLOQUEADO", f"Dependencia de assets/entrega do frontend: {path}; Spring direto HTTP {status}; renderizacao nao aprovada")
                for path in ("/funcionario", "/funcionario/perfil", "/funcionario/relatorio", "/recuperar-senha", "/first-access"):
                    status, _, _ = browser.request(app+path)
                    record("BLOQUEADO", f"Pagina fora desta entrega, dependente do Guilherme: {path}; Spring direto HTTP {status}")
                record("BLOQUEADO", "Fluxo visual completo no navegador, CSS/JS/imagens e paginas pendentes dependem da entrega/roteamento do frontend; nao homologados")
            scenario("dependencias-frontend", dependencies)
        except Exception as failure:
            current = "infra"
            record("FALHOU", failure)
            record("BLOQUEADO", "Cenarios nao concluidos por falha de infraestrutura/setup; nao considerar aprovados")
        finally:
            current = "preservacao"
            for process in reversed(processes):
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
            provider.shutdown()
            provider.server_close()
            for name in reversed(containers):
                try:
                    run("docker", "rm", "-f", name)
                    record("PASSOU", "Container temporario removido: "+name)
                except Exception as failure:
                    record("FALHOU", "Limpeza do container temporario: "+safe(failure))
            try:
                check(run(*S.SNAPSHOT) == baseline, "mysql-dev/node-dev: mesmos IDs, estado, inicio e contadores de reinicio")
                check(all(p.is_file() and hashlib.sha256(p.read_bytes()).digest() == digest for p, digest in protected.items()),
                      "Todos os .env/.env.* preservados byte a byte; configuracoes reais nao carregadas")
                check(all(p.is_file() and hashlib.sha256(p.read_bytes()).digest() == digest for p, digest in originals.items()),
                      "Paginas e assets originais preservados byte a byte")
            except Exception as failure:
                record("FALHOU", failure)
    counts = {status: sum(row[0] == status for row in results) for status in ("PASSOU", "FALHOU", "BLOQUEADO")}
    lines = ["# Homologacao das paginas Spring", "", "Execucao UTC: "+started,
             "Branch: "+run("git", "branch", "--show-current", cwd=ROOT),
             "JAR SHA-256: "+hashlib.sha256(JAR.read_bytes()).hexdigest(),
             "", "Compilacao: Java 21; ./mvnw -o -DskipTests package. Sem testes JUnit; validacoes HTTP abaixo.",
             "JAR completo, repositories/JDBC reais, MySQL 8.4 e Redis 7 descartaveis; Gov.br simulado local com PKCE.",
             "Nenhum banco de desenvolvimento/producao acessado; sem Express, commit, merge ou deploy.",
             "", f"Requisicoes HTTP verificadas: {requests}. "+", ".join(f"{k}: {v}" for k, v in counts.items())+".",
             "PASSOU significa apenas o cenario descrito. BLOQUEADO nao conta como aprovacao do frontend/fluxo visual.",
             "", "| Estado | Grupo | Evidencia |", "| --- | --- | --- |"]
    lines.extend("| "+" | ".join(row)+" |" for row in results)
    REPORT.write_text("\n".join(lines)+"\n")
    print(json.dumps(counts), flush=True)
    print("Relatorio: "+str(REPORT), flush=True)
    return int(counts["FALHOU"] > 0)


if __name__ == "__main__":
    raise SystemExit(main())
