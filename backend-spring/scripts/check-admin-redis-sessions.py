#!/usr/bin/env python3
"""Homologa sessoes distribuidas no JAR real; MySQL/Redis tmpfs e Gov.br local.

Nao carrega .env nem altera mysql-dev/node-dev. Java 21, Docker e imagens locais
mysql:8.4/redis:7-alpine obrigatorios. --only repete somente os grupos afetados.
"""
import argparse
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
import urllib.parse
import uuid

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("session_support", Path(__file__).with_name("check-public-schools.py"))
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)
Browser, run, wait_until, free_port = S.Browser, S.run, S.wait_until, S.free_port
ROOT, JAR = S.ROOT, S.JAR
REPORT = ROOT / "backend-spring/HOMOLOGACAO-SESSOES-ADMIN-REDIS.md"
GROUPS = ("oauth", "restart", "logout", "revocation", "csrf", "isolation", "hmac", "expiry", "outage")
COOKIE = "ATESTA_ADMIN_SESSION"
ME = "/api/admin/auth/me"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help=",".join(GROUPS))
    args = parser.parse_args()
    selected = set(args.only.split(",")) if args.only else set(GROUPS)
    if not selected <= set(GROUPS):
        parser.error("Grupo desconhecido")
    results, processes, containers, private = [], [], [], []
    current = "infra"
    protected = {p: hashlib.sha256(p.read_bytes()).digest() for p in ROOT.rglob(".env") if "node_modules" not in p.parts}
    baseline = run(*S.SNAPSHOT)
    assert S.SUPPORT.java21() and JAR.is_file(), "Empacote o JAR com Java 21 primeiro"
    suffix = uuid.uuid4().hex[:12]
    mysql, redis_name = "atesta-session-mysql-" + suffix, "atesta-session-redis-" + suffix
    namespace = "atestaponto:session-check-" + suffix
    key, session_secret, jwt_secret, provider_secret = [secrets.token_hex(32) for _ in range(4)]
    private.extend((key, session_secret, jwt_secret, provider_secret))

    def check(ok, description):
        if not ok:
            raise AssertionError(description)
        results.append(("PASSOU", current, description))
        print("PASSOU " + current + ": " + description, flush=True)

    def safe(value):
        value = str(value)
        for secret in sorted(private, key=len, reverse=True):
            if secret:
                value = value.replace(secret, "[redacted]")
        return value[:1500].replace("\n", " ")

    def stop(process):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

    with tempfile.TemporaryDirectory(prefix="atesta-session-http-") as temporary:
        folder = Path(temporary)
        provider = http.server.ThreadingHTTPServer(("127.0.0.1", 0), S.Provider)
        provider.daemon_threads = True
        S.Provider.secret = provider_secret
        threading.Thread(target=provider.serve_forever, daemon=True).start()
        try:
            for name, port, options, command in (
                (mysql, "3306", ["--memory", "512m", "--tmpfs", "/var/lib/mysql:rw,size=512m", "-e", "MYSQL_ALLOW_EMPTY_PASSWORD=yes", "-e", "MYSQL_DATABASE=session_check"], ["mysql:8.4", "--innodb-buffer-pool-size=64M"]),
                (redis_name, "6379", ["--memory", "128m", "--tmpfs", "/data:rw,size=64m"], ["redis:7-alpine", "redis-server", "--save", "", "--appendonly", "no"])):
                run("docker", "run", "--rm", "-d", "--name", name, "--label", "atestaponto.purpose=admin-redis-sessions-homologation",
                    "-p", "127.0.0.1::" + port, *options, *command)
                containers.append(name)
            mysql_port = run("docker", "port", mysql, "3306/tcp").rsplit(":", 1)[1]
            redis_port = run("docker", "port", redis_name, "6379/tcp").rsplit(":", 1)[1]

            def sql(statement):
                return run("docker", "exec", "-i", mysql, "mysql", "--protocol=TCP", "-h127.0.0.1", "-uroot", "-N", "session_check", input=statement)

            def redis(*command):
                return run("docker", "exec", redis_name, "redis-cli", "--raw", *command)

            def ready():
                try:
                    return sql("SELECT 1") == "1" and redis("PING") == "PONG"
                except subprocess.CalledProcessError:
                    return False

            wait_until(ready)
            sql((ROOT / "atesta-gateway/database/schema/ponto.sql").read_text())
            sql("""
              INSERT INTO diretorias_ensino(id,nome,codigo) VALUES (1,'Fictional DRE','SESSION-A');
              INSERT INTO unidades_escolares(id,diretoria_ensino_id,nome,latitude,longitude) VALUES (1,1,'Fictional School',0,0);
              INSERT INTO usuarios_administrativos(id,cpf,nome,email,ativo) VALUES
                (1,'10000000001','Fictional Director','director@example.invalid',1),
                (2,'10000000002','Fictional Global','global@example.invalid',1);
              INSERT INTO acessos_administrativos(id,usuario_administrativo_id,perfil,unidade_escolar_id,status) VALUES (1,1,'DIRETOR',1,'ATIVO');
              INSERT INTO acessos_administrativos(id,usuario_administrativo_id,perfil,status) VALUES (2,2,'ADMIN_SEDUC','ATIVO');
              INSERT INTO cargos(id,cargo) VALUES(1,'FUNCIONARIO');
              INSERT INTO funcionarios(id,cpf,nome,email,ativo) VALUES(1,'52998224725','Fictional Employee','employee@example.invalid',1);
              INSERT INTO login_funcionario(funcionario_id,senha_hash,primeiro_acesso) VALUES(1,'isolated-credential-marker',0);
              INSERT INTO vinculos_funcionais(id,funcionario_id,unidade_escolar_id,cargo_id,horario_entrada,horario_saida_almoco,horario_volta_almoco,horario_saida,data_inicio,status)
                VALUES(1,1,1,1,'08:00','12:00','13:00','17:00',CURRENT_DATE,'ATIVO');
            """)
            credential_hash = run("node", "-e", "const fs=require('fs');process.stdout.write(require(process.argv[1]).hashSync(fs.readFileSync(0,'utf8'),4))",
                str(ROOT / "atesta-gateway/node_modules/bcrypt"), input=secrets.token_urlsafe(24))
            private.append(credential_hash)
            sql("UPDATE login_funcionario SET senha_hash='"+credential_hash+"' WHERE funcionario_id=1")
            ports = [free_port() for _ in range(3)]
            apps = ["http://127.0.0.1:" + str(port) for port in ports]
            govbr = "http://127.0.0.1:" + str(provider.server_port)
            base = {k: os.environ[k] for k in ("PATH", "JAVA_HOME", "SystemRoot", "WINDIR") if k in os.environ}
            environment = dict(base, DB_HOST="127.0.0.1", DB_PORT=mysql_port, DB_NAME="session_check", DB_USER="root", DB_PASSWORD="",
                JWT_SECRET=jwt_secret, SESSION_SECRET=session_secret, INTERNAL_API_SHARED_KEY=key,
                REDIS_ENABLED="true", REDIS_HOST="127.0.0.1", REDIS_PORT=redis_port, REDIS_NAMESPACE=namespace,
                NODE_ENV="production", MAIL_ENABLED="false", ADMIN_SESSION_SECURE="false", ADMIN_SESSION_TTL_SECONDS="600",
                GOVBR_AUTHORIZE_URL=govbr+"/authorize", GOVBR_TOKEN_URL=govbr+"/token", GOVBR_USERINFO_URL=govbr+"/userinfo",
                GOVBR_CLIENT_ID="isolated-session-check", GOVBR_CLIENT_SECRET=provider_secret,
                GOVBR_REDIRECT_URI=apps[0]+"/auth/govbr/callback", GOVBR_LOGOUT_URL="/", CORS_ORIGIN="https://fixture.invalid")

            def start(index, extra=()):
                logpath = folder / ("spring-" + str(index) + ".log")
                with logpath.open("a") as log:
                    process = subprocess.Popen(["java", "-Djava.io.tmpdir="+str(folder), "-jar", str(JAR), "--server.address=127.0.0.1", "--server.port="+str(ports[index]), *extra], cwd=folder, env=environment, stdout=log, stderr=log)
                processes.append(process)
                wait_until(lambda: process.poll() is not None or Browser().request(apps[index]+"/auth/govbr/start")[0] == 302)
                if process.poll() is not None:
                    relevant = "\n".join(line for line in logpath.read_text().splitlines() if "ERROR" in line or "Caused by:" in line)
                    raise RuntimeError("Spring encerrou: " + safe(relevant[-3500:]))
                return process

            spring = [start(0), start(1)]
            check(True, "Java 21/JAR real; duas instancias; MySQL 8.4 e Redis 7 tmpfs; Gov.br simulado")

            def request(index, path=ME, sid=None, method="GET", data=None, headers=None):
                options = dict(headers or {})
                if sid:
                    options["Cookie"] = COOKIE + "=" + sid
                return Browser().request(apps[index]+path, method, data, options)

            def session_key(sid):
                return namespace+":admin:spring-session:sessions:"+base64.b64decode(sid).decode()

            def begin(account=1, index=0, fixed=None):
                browser = Browser()
                status, headers, _ = browser.request(apps[index]+"/auth/govbr/login", headers={} if fixed is None else {"Cookie":COOKIE+"="+fixed})
                assert status == 302, "Inicio OAuth deve redirecionar"
                sid = browser.sid()
                private.append(sid)
                q = urllib.parse.parse_qs(urllib.parse.urlsplit(headers["Location"]).query)
                assert q["code_challenge_method"] == ["S256"] and len(q["code_challenge"][0]) == 43 and len(q["state"][0]) == 43
                status, provider_headers, _ = Browser().request(headers["Location"], headers={"X-Fixture-Account":str(account)})
                assert status == 302
                callback = urllib.parse.urlsplit(provider_headers["Location"])
                return sid, callback.path+"?"+callback.query, headers

            def finish(pending, callback, index=1):
                status, headers, _ = request(index, callback, pending)
                assert status == 302 and headers["Location"].endswith("/admin/dashboard"), "Callback OAuth deve autenticar"
                sid = next(value.split(";",1)[0].split("=",1)[1] for value in headers.get_all("Set-Cookie",[]) if value.startswith(COOKIE+"="))
                private.append(sid)
                assert sid != pending and redis("EXISTS",session_key(pending)) == "0", "Rotacao deve excluir ID pre-login"
                return sid, headers

            def login(account=1, source=0, target=1):
                pending, callback, _ = begin(account, source)
                return finish(pending, callback, target)[0]

            def clear_rates():
                keys = redis("--scan", "--pattern", namespace+":ponto:rate_limit:*").splitlines()
                if keys:
                    redis("DEL", *keys)

            def csrf(sid, index=0):
                assert request(index,"/admin/session-check",sid,"POST",b"")[0] == 403
                raw = subprocess.run(["docker","exec",redis_name,"redis-cli","--raw","HGET",session_key(sid),
                    "sessionAttr:org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository.CSRF_TOKEN"],check=True,capture_output=True).stdout
                token = re.findall(rb"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}",raw)
                assert len(token) == 1, "CSRF deve estar persistido na sessao Redis"
                # Mesma codificacao XOR usada pelo handler CSRF padrao do Spring Security.
                mask = secrets.token_bytes(len(token[0]))
                return base64.urlsafe_b64encode(mask+bytes(a^b for a,b in zip(mask,token[0]))).decode()

            def oauth():
                pending, callback, headers = begin()
                check(redis("EXISTS",session_key(pending)) == "1", "OAuth pendente persistido no Redis antes do callback")
                sid, authenticated = finish(pending,callback)
                check(request(0,sid=sid)[0] == request(1,sid=sid)[0] == 200, "OAuth/PKCE inicia A, termina B; autenticacao nas duas instancias")
                check(sid != pending and request(0,sid=pending)[0] == 401, "Rotacao elimina ID pre-login e impede session fixation")
                cookie = ",".join(authenticated.get_all("Set-Cookie",[]))
                check(all(flag in cookie for flag in ("Path=/","HttpOnly","SameSite=Lax","Max-Age=600")), "Nome, caminho, HttpOnly, SameSite e TTL do cookie preservados")
                check(sql("SELECT ultimo_login_em IS NOT NULL FROM usuarios_administrativos WHERE id=1") == "1", "Callback grava ultimo login somente no MySQL temporario")
                fixed = base64.b64encode(str(uuid.uuid4()).encode()).decode()
                new_pending, new_callback, _ = begin(fixed=fixed)
                check(new_pending != fixed, "ID inexistente escolhido pelo navegador nao e aceito")
                new_sid, _ = finish(new_pending,new_callback,0)
                check(new_sid not in (fixed,new_pending) and request(1,sid=fixed)[0] == 401, "ID imposto e ID pre-login nao autorizam apos login")
                bad, bad_callback, _ = begin()
                parts = urllib.parse.urlsplit(bad_callback)
                query = urllib.parse.parse_qs(parts.query)
                query["state"] = ["invalid"]
                changed = parts.path+"?"+urllib.parse.urlencode(query,doseq=True)
                check(request(1,changed,bad)[0] == 401 and request(0,bad_callback,bad)[0] == 400, "State adulterado rejeitado e estado consumido entre instancias")
                duplicate, duplicate_callback, _ = begin()
                check(request(1,duplicate_callback+"&state=duplicate",duplicate)[0] == 400, "State duplicado rejeitado")
                injected, injected_callback, _ = begin()
                check(request(1,injected_callback+"&access_token=injected",injected)[0] == 400, "Token injetado na URL rejeitado")
                badpkce, badpkce_callback, _ = begin()
                code = urllib.parse.parse_qs(urllib.parse.urlsplit(badpkce_callback).query)["code"][0]
                body = urllib.parse.urlencode(dict(code=code,code_verifier="x"*43,client_secret=provider_secret,redirect_uri=environment["GOVBR_REDIRECT_URI"])).encode()
                check(Browser().request(govbr+"/token","POST",body,{"Content-Type":"application/x-www-form-urlencoded"})[0] == 401, "Gov.br simulado confere e rejeita PKCE incorreto")
                check(request(1,badpkce_callback,badpkce)[0] == 502 and request(0,sid=badpkce)[0] == 401, "Falha no provedor nao cria sessao administrativa")
                check(request(0,callback,pending)[0] == 400, "Callback nao pode ser reutilizado em outra instancia")

            def restart():
                sid = login()
                token = csrf(sid)
                for index in (0,1):
                    stop(spring[index])
                    spring[index] = start(index)
                    check(request(index,sid=sid)[0] == 200, "Sessao autenticada preservada apos reiniciar instancia "+str(index))
                check(request(1,"/admin/session-check",sid,"POST",b"",{"X-CSRF-TOKEN":token})[0] == 404, "CSRF persistido sobrevive ao reinicio das duas instancias")
                pending, callback, _ = begin()
                stop(spring[0]); spring[0] = start(0)
                sid, _ = finish(pending,callback)
                check(request(0,sid=sid)[0] == 200, "OAuth pendente sobrevive ao reinicio da instancia de origem")

            def logout():
                sid = login()
                for headers in ({}, {"Origin":"https://evil.invalid"}):
                    check(request(1,"/auth/govbr/logout",sid,"POST",b"",headers)[0] == 403, "Logout sem origem confiavel rejeitado")
                check(request(0,sid=sid)[0] == 200, "Logout rejeitado preserva a sessao")
                status, headers, _ = request(1,"/auth/govbr/logout",sid,"POST",b"",{"Origin":apps[0]})
                check(status == 302 and any("Max-Age=0" in c for c in headers.get_all("Set-Cookie",[])), "Logout na B expira cookie administrativo")
                check(redis("EXISTS",session_key(sid)) == "0" and all(request(i,sid=sid)[0] == 401 for i in (0,1)), "Logout global: chave excluida e ID recusado em A/B")
                stop(spring[0]); spring[0] = start(0)
                check(request(0,sid=sid)[0] == 401, "Logout permanece invalido apos reinicio")

            def revocation():
                operator = login(2)
                victim, second = login(), login(source=1,target=0)
                check(all(request(i,sid=victim)[0] == 200 for i in (0,1)), "Acesso JDBC inicialmente ativo nas duas instancias")
                status, _, _ = request(0,"/api/admin/acessos/1/revogar",operator,"PATCH",b"",{"Origin":apps[0]})
                check(status == 200 and sql("SELECT status FROM acessos_administrativos WHERE id=1") == "REVOGADO", "Revogacao confirmada pela API publica e MySQL isolado")
                check(request(1,sid=victim)[0] == 403 and redis("EXISTS",session_key(victim)) == "0", "Revogacao detectada em auth/me na B exclui sessao Redis")
                check(request(0,sid=victim)[0] == 401, "Sessao revogada na B nao e aceita na A")
                check(request(0,"/api/admin/acessos/meu",second)[0] == 401 and redis("EXISTS",session_key(second)) == "0", "Outra sessao do mesmo usuario tambem e invalidada ao revalidar")
                denied, callback, _ = begin()
                check(request(1,callback,denied)[0] == 403, "Novo login negado apos revogacao")
                sql("UPDATE acessos_administrativos SET status='ATIVO' WHERE id=1")
                check(request(0,sid=victim)[0] == request(1,sid=second)[0] == 401, "Restaurar fixture de acesso nao ressuscita IDs invalidados")
                inactive = login()
                sql("UPDATE usuarios_administrativos SET ativo=0 WHERE id=1")
                check(request(1,sid=inactive)[0] == 403 and request(0,sid=inactive)[0] == 401, "Desativar identidade tambem invalida sessao distribuida")
                sql("UPDATE usuarios_administrativos SET ativo=1 WHERE id=1")

            def csrf_checks():
                sid, other = login(), login()
                token = csrf(sid)
                check(request(1,"/admin/session-check",sid,"POST",b"")[0] == 403, "POST administrativo sem CSRF rejeitado na outra instancia")
                check(request(1,"/admin/session-check",sid,"POST",b"",{"X-CSRF-TOKEN":"invalid"})[0] == 403, "CSRF adulterado rejeitado")
                check(request(1,"/admin/session-check",sid,"POST",b"",{"X-CSRF-TOKEN":token})[0] == 404, "CSRF valido carregado do Redis e aceito na B")
                check(request(1,"/admin/session-check",other,"POST",b"",{"X-CSRF-TOKEN":token})[0] == 403, "CSRF nao pode ser transferido para outra sessao")
                for headers in ({}, {"Origin":"https://evil.invalid"}, {"Origin":apps[0]+".evil.invalid"}):
                    check(request(1,"/api/admin/qr-tokens",sid,"POST",b"",headers)[0] == 403, "API sem CSRF rejeita origem ausente ou externa")
                check(request(1,"/api/admin/qr-tokens",sid,"POST",b"",{"Origin":apps[0]})[0] == 200, "Excecao CSRF existente aceita somente origem configurada")

            def isolation():
                sid = login()
                now = int(time.time())
                compact = lambda value: json.dumps(value,separators=(",",":"))
                encode = lambda value: base64.urlsafe_b64encode(value).decode().rstrip("=")
                version = hmac.new(jwt_secret.encode(),compact(["employee-credential-v1","1",credential_hash]).encode(),hashlib.sha256).hexdigest()
                unsigned = encode(compact({"alg":"HS256","typ":"JWT"}).encode())+"."+encode(compact(dict(sub="1",role="funcionario",credentialVersion=version,iat=now,exp=now+600)).encode())
                employee = unsigned+"."+encode(hmac.new(jwt_secret.encode(),unsigned.encode(),hashlib.sha256).digest())
                private.append(employee)
                check(request(0,"/api/pontos/hoje",headers={"Authorization":"Bearer "+employee})[0] == 200, "JWT de funcionario ficticio e valido no fluxo de ponto real")
                check(request(1,headers={"Authorization":"Bearer "+employee})[0] == 401, "JWT valido de funcionario nao autentica administrador")
                public_cookies, stored = [], {}
                for name in ("ponto_qr_acesso","ponto_recovery","connect.sid"):
                    raw = secrets.token_urlsafe(24)
                    signed = "s:"+raw+"."+base64.b64encode(hmac.new(session_secret.encode(),raw.encode(),hashlib.sha256).digest()).decode().rstrip("=")
                    value = urllib.parse.quote(signed,safe="")
                    private.append(value)
                    public_cookies.append(name+"="+value)
                    record_key = namespace+":ponto:session:"+hashlib.sha256(raw.encode()).hexdigest()
                    record = compact(dict(cookie={"expires":(dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=10)).isoformat()},
                        admin={"id":1,"role":"ADMIN"},passwordRecovery={"employeeId":1,"verified":True},funcionario_qr={"token":"fixture"}))
                    redis("SET",record_key,record,"EX","600")
                    stored[record_key] = record
                    check(request(1,headers={"Cookie":name+"="+value})[0] == 401, "Cookie assinado "+name+" nao concede acesso administrativo")
                    check(request(1,sid=value)[0] == 401, "Cookie "+name+" renomeado para administrativo tambem e recusado")
                mixed = "; ".join(public_cookies)
                check(request(1,headers={"Cookie":COOKIE+"="+sid+"; "+mixed})[0] == 200, "Cookies coexistem sem mascarar sessao administrativa")
                check(request(1,"/api/pontos/hoje",sid=sid)[0] == 401, "Cookie administrativo nao autentica funcionario")
                check(request(1,"/api/pontos/hoje",headers={"Cookie":COOKIE+"="+sid+"; "+mixed,"Authorization":"Bearer "+employee})[0] == 200, "JWT de funcionario funciona com todos os cookies coexistindo")
                request(1,"/auth/govbr/logout",sid,"POST",b"",{"Origin":apps[0]})
                check(all(redis("GET",k) == value for k,value in stored.items()), "Logout administrativo preserva chaves Express/QR/recuperacao")
                keys = redis("--scan","--pattern",namespace+":*").splitlines()
                admin_keys = [k for k in keys if ":admin:spring-session:" in k]
                check(admin_keys and all(redis("TYPE",k) == "hash" for k in admin_keys) and all(k not in admin_keys for k in stored), "Namespace e tipos Redis administrativos isolados das sessoes Express JSON")

            def signed(path, body, timestamp=None):
                timestamp = str(int(time.time()) if timestamp is None else timestamp)
                request_id = str(uuid.uuid4())
                canonical = "\n".join(("POST",path,timestamp,request_id,hashlib.sha256(body).hexdigest()))
                return {"Content-Type":"application/json","X-Internal-Timestamp":timestamp,"X-Internal-Request-Id":request_id,
                    "X-Internal-Signature":hmac.new(key.encode(),canonical.encode(),hashlib.sha256).hexdigest()}

            def hmac_checks():
                sid = login()
                path, body = "/internal/auth/admin/context", b'{"admin_id":1}'
                for index in (0,1):
                    check(request(index,path,sid,"POST",body,{"Content-Type":"application/json"})[0] == 401, "Cookie admin nao substitui HMAC na instancia "+str(index))
                    headers = signed(path,body)
                    check(request(index,path,sid,"POST",body,headers)[0] == 200, "HMAC valido consulta contexto JDBC na instancia "+str(index))
                    check(request(index,path,sid,"POST",body,headers)[0] == 401, "Replay HMAC rejeitado na instancia "+str(index))
                    check(request(index,path,sid,"POST",b'{"admin_id":2}',signed(path,body))[0] == 401, "Corpo HMAC adulterado rejeitado na instancia "+str(index))
                    check(request(index,path,sid,"POST",body,signed(path,body,int(time.time())-120))[0] == 401, "Timestamp HMAC expirado rejeitado na instancia "+str(index))

            def expiry():
                short = start(2,("--admin.session.ttl-seconds=5",))
                try:
                    sid = login(target=2)
                    ttl = int(redis("PTTL",session_key(sid)))
                    check(0 < ttl <= 5000, "TTL curto realmente aplicado a chave Redis")
                    deadline = time.monotonic()+7
                    accepted = 0
                    while time.monotonic() < deadline:
                        if request(0,sid=sid)[0] == 401:
                            break
                        accepted += 1
                        time.sleep(.4)
                    check(accepted >= 2 and request(1,sid=sid)[0] == 401 and redis("EXISTS",session_key(sid)) == "0", "Expiracao absoluta vence mesmo com atividade continua em outra instancia")
                    idle = login(target=2)
                    time.sleep(5.2)
                    check(redis("EXISTS",session_key(idle)) == "0" and request(0,sid=idle)[0] == 401, "Expiracao ociosa elimina chave e rejeita replay manual do cookie")
                finally:
                    stop(short)
                secure = start(2,("--admin.session.secure=true","--admin.govbr.redirect-uri=https://admin.invalid/auth/govbr/callback",
                    "--admin.govbr.authorize-url=https://provider.invalid/authorize","--admin.govbr.token-url=https://provider.invalid/token","--admin.govbr.userinfo-url=https://provider.invalid/userinfo"))
                try:
                    status, headers, _ = request(2,"/auth/govbr/login")
                    check(status == 302 and all(flag in headers.get("Set-Cookie","") for flag in ("Secure","HttpOnly","SameSite=Lax")), "Configuracao HTTPS preserva cookie Secure/HttpOnly/SameSite")
                finally:
                    stop(secure)

            def outage():
                sid = login()
                pending, callback, _ = begin()
                run("docker","pause",redis_name)
                try:
                    for index in (0,1):
                        check(request(index,sid=sid)[0] >= 500, "Redis indisponivel recusa sessao autenticada na instancia "+str(index))
                        status, headers, _ = request(index,"/auth/govbr/login")
                        check(status >= 500 and not any(c.startswith("JSESSIONID=") for c in headers.get_all("Set-Cookie",[])), "Redis indisponivel impede login sem JSESSIONID alternativo na instancia "+str(index))
                    check(request(1,callback,pending)[0] >= 500, "Callback pendente tambem falha fechado durante indisponibilidade")
                    path, body = "/internal/auth/admin/context", b'{"admin_id":1}'
                    check(request(0,path,sid,"POST",body,signed(path,body))[0] == 200, "HMAC interno continua operante com cookie admin e Redis de sessao indisponivel")
                    check(request(1,sid="invalid")[0] >= 400, "Cookie invalido nao cria sessao alternativa durante indisponibilidade")
                finally:
                    run("docker","unpause",redis_name)
                check(request(0,sid=sid)[0] == request(1,sid=sid)[0] == 200, "Recuperacao Redis restaura apenas sessao persistida existente")
                # Simula perda do armazenamento: IDs nao podem ser recuperados de memoria local.
                keys = redis("--scan","--pattern",namespace+":admin:spring-session:*").splitlines()
                if keys:
                    redis("DEL",*keys)
                check(request(0,sid=sid)[0] == request(1,sid=sid)[0] == 401, "Perda das chaves Redis nao ressuscita sessao em memoria de A/B")
                check(request(0,sid=login())[0] == 200, "Novo login funciona apos recuperacao sem reutilizar estado antigo")

            actions = dict(oauth=oauth,restart=restart,logout=logout,revocation=revocation,csrf=csrf_checks,isolation=isolation,hmac=hmac_checks,expiry=expiry,outage=outage)
            for group in GROUPS:
                if group not in selected:
                    continue
                current = group
                try:
                    clear_rates()
                    actions[group]()
                except Exception as failure:
                    results.append(("FALHOU",group,safe(type(failure).__name__+": "+str(failure))))
                    print("FALHOU "+group+": "+safe(failure),flush=True)
                    # Cada grupo usa sessoes novas; restaurar somente a fixture mutada por revogacao.
                    if group == "revocation":
                        sql("UPDATE usuarios_administrativos SET ativo=1 WHERE id=1; UPDATE acessos_administrativos SET status='ATIVO' WHERE id=1")
            current = "audit"
            logs = "\n".join(p.read_text() for p in folder.glob("spring-*.log"))
            check(all(secret not in logs for secret in private if secret) and all(token not in logs for token in S.Provider.tokens), "Logs sem chaves, cookies de sessao ou tokens OAuth")
            check(not any(value in logs for value in ("10000000001","10000000002","52998224725","@example.invalid")), "Logs sem CPF/email das fixtures")
        except Exception as failure:
            results.append(("BLOQUEADO",current,safe(type(failure).__name__+": "+str(failure))))
            print("BLOQUEADO "+current+": "+safe(failure),flush=True)
        finally:
            for process in reversed(processes):
                stop(process)
            provider.shutdown(); provider.server_close()
            for name in reversed(containers):
                run("docker","rm","-f",name)
            current = "cleanup"
            check(run(*S.SNAPSHOT) == baseline, "mysql-dev e node-dev preservados: ID, estado, inicio e contador de reinicios")
            check(all(p.exists() and hashlib.sha256(p.read_bytes()).digest() == digest for p,digest in protected.items()), ".env preservados byte a byte")
            names = run("docker","ps","-a","--format","{{.Names}}").splitlines()
            check(all(name not in names for name in containers) and all(p.poll() is not None for p in processes), "Somente containers/processos temporarios encerrados; Gov.br local finalizado")
            if not REPORT.exists():
                REPORT.write_text("# Homologacao — sessoes administrativas Spring Redis\n\nJava 21, JAR real, duas instancias Spring, MySQL 8.4/Redis 7 descartaveis em tmpfs\ne Gov.br Python simulado com validacao de PKCE. Sem Express, .env ou banco real.\n\nReproduzir: `./mvnw -o -DskipTests package && python3 scripts/check-admin-redis-sessions.py`.\nRepetir somente grupos afetados: `python3 scripts/check-admin-redis-sessions.py --only csrf,outage`.\nRequer Docker e imagens locais `mysql:8.4` e `redis:7-alpine`.\nSem commit, merge, push ou deploy.\n")
            lines = ["", "## Rodada UTC "+dt.datetime.now(dt.timezone.utc).isoformat(), "", "Grupos: "+(args.only or "todos")+".", "", "| Resultado | Grupo | Cenario |", "|---|---|---|"]
            lines.extend(f"| {status} | {group} | {description.replace('|','/')} |" for status,group,description in results)
            lines.extend(["", "Totais: "+"; ".join(f"{status}={sum(s==status for s,_,_ in results)}" for status in ("PASSOU","FALHOU","BLOQUEADO"))+".", ""])
            with REPORT.open("a") as output:
                output.write("\n".join(lines))
    if any(status != "PASSOU" for status,_,_ in results):
        raise SystemExit(1)
    print("PASSOU "+str(len(results))+" verificacoes; "+str(REPORT.relative_to(ROOT)),flush=True)


if __name__ == "__main__":
    main()
