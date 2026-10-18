#!/usr/bin/env python3
"""Homologacao HTTP Spring com MySQL/Redis descartaveis e Gov.br Python local.

Nao carrega .env nem acessa mysql-dev/node-dev. Requer JAR Java 21 e imagens
locais mysql:8.4 e redis:7-alpine. --only repete somente os grupos afetados.
"""
import argparse
import concurrent.futures
import datetime
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
SPEC = importlib.util.spec_from_file_location("school_support", Path(__file__).with_name("check-public-schools.py"))
SUPPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUPPORT)
Browser, Provider = SUPPORT.Browser, SUPPORT.Provider
run, wait_until, free_port = SUPPORT.run, SUPPORT.wait_until, SUPPORT.free_port
ROOT, JAR = SUPPORT.ROOT, SUPPORT.JAR
REPORT = ROOT / "backend-spring/HOMOLOGACAO-ACESSOS-CARGOS-QR.md"
SNAPSHOT = ["docker", "inspect", "--format", "{{.Name}} {{.Id}} {{.State.Status}} {{.State.StartedAt}} {{.RestartCount}}", "mysql-dev", "node-dev"]
GROUPS = {"contracts", "grant", "lifecycle", "rbac", "csrf", "sessions", "race-revoke", "race-status",
          "rollback", "qr", "hmac", "abuse", "expiry"}


def fictional_cpf(number):
    value = f"8{number:08d}"
    for size in (9, 10):
        digit = sum(int(c) * (size + 1 - i) for i, c in enumerate(value)) * 10 % 11
        value += str(0 if digit == 10 else digit)
    return value


class AccessProvider(Provider):
    def do_GET(self):
        if urllib.parse.urlsplit(self.path).path == "/userinfo":
            account = self.tokens.get(self.headers.get("Authorization", "").removeprefix("Bearer "))
            if account is None: return self.reply(401)
            return self.reply(200, {"sub":"fictional-"+account,"cpf":fictional_cpf(int(account))})
        return super().do_GET()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="Grupos separados por virgula: " + ",".join(sorted(GROUPS)))
    args = parser.parse_args()
    selected = set(args.only.split(",")) if args.only else GROUPS
    if selected - GROUPS:
        parser.error("Grupo desconhecido: " + ",".join(sorted(selected - GROUPS)))
    results, processes, clients, containers, secrets_used = [], [], [], [], []
    current = "infra"
    baseline = run(*SNAPSHOT)
    protected = {p: hashlib.sha256(p.read_bytes()).digest() for p in ROOT.rglob(".env") if "node_modules" not in p.parts}
    assert SUPPORT.SUPPORT.java21() and JAR.is_file(), "Empacote o JAR com Java 21 primeiro"
    suffix = uuid.uuid4().hex[:12]
    mysql_name, redis_name = "atesta-access-mysql-" + suffix, "atesta-access-redis-" + suffix
    namespace = "atestaponto:access-check-" + suffix

    def check(condition, description):
        assert condition, description
        results.append(("PASSOU", current, description))
        print("PASSOU " + current + ": " + description, flush=True)

    def safe(message):
        for secret in secrets_used:
            message = message.replace(secret, "[redacted]")
        return message[:1200]

    with tempfile.TemporaryDirectory(prefix="atesta-access-http-") as temporary:
        folder = Path(temporary)
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), AccessProvider)
        server.daemon_threads = True
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            run("docker", "run", "--rm", "-d", "--name", mysql_name,
                "--label", "atestaponto.purpose=public-access-qr-homologation", "--memory", "512m",
                "--tmpfs", "/var/lib/mysql:rw,size=512m", "-p", "127.0.0.1::3306",
                "-e", "MYSQL_ALLOW_EMPTY_PASSWORD=yes", "-e", "MYSQL_DATABASE=access_check",
                "mysql:8.4", "--innodb-buffer-pool-size=64M")
            containers.append(mysql_name)
            run("docker", "run", "--rm", "-d", "--name", redis_name,
                "--label", "atestaponto.purpose=public-access-qr-homologation", "--memory", "128m",
                "--tmpfs", "/data:rw,size=64m", "-p", "127.0.0.1::6379", "redis:7-alpine",
                "redis-server", "--save", "", "--appendonly", "no")
            containers.append(redis_name)
            mysql_port = run("docker", "port", mysql_name, "3306/tcp").rsplit(":", 1)[1]
            redis_port = run("docker", "port", redis_name, "6379/tcp").rsplit(":", 1)[1]

            def sql(statement):
                try:
                    return run("docker", "exec", "-i", mysql_name, "mysql", "--protocol=TCP", "-h127.0.0.1", "-uroot", "-N", "access_check", input=statement)
                except subprocess.CalledProcessError as error:
                    raise RuntimeError(error.stderr.strip()) from None

            def redis(*command):
                return run("docker", "exec", redis_name, "redis-cli", "--raw", *command)

            def mysql_ready():
                try: return sql("SELECT 1") == "1"
                except RuntimeError: return False

            wait_until(mysql_ready)
            wait_until(lambda: redis("PING") == "PONG")
            sql((ROOT / "atesta-gateway/database/schema/ponto.sql").read_text())
            sql("""
              INSERT INTO diretorias_ensino(id,nome,codigo,cidade_sede) VALUES
              (1,'Fictional DRE A','CHECK-A','Fictional City'),(2,'Fictional DRE B','CHECK-B','Fictional City'),
              (3,'Fictional DRE Empty','CHECK-E','Fictional City');
              INSERT INTO unidades_escolares(id,diretoria_ensino_id,nome,latitude,longitude) VALUES
              (1,1,'Fictional School A',0,0),(2,2,'Fictional School B',0,0),(3,1,'Fictional School C',0,0);
              INSERT INTO cargos(cargo,ativo) VALUES('PROFESSOR',1),('INSPETOR',1),('FUNCIONARIO',0);
            """)
            for i in range(1, 25):
                sql(f"INSERT INTO usuarios_administrativos(id,cpf,nome,email,ativo) VALUES ({i},'{fictional_cpf(i)}','Fictional Admin {i}','fictional{i}@example.invalid',{0 if i == 11 else 1})")
            sql("""
              INSERT INTO acessos_administrativos(id,usuario_administrativo_id,perfil,unidade_escolar_id,status) VALUES
              (1,1,'DIRETOR',1,'ATIVO'),(5,5,'VICE_DIRETOR',1,'ATIVO'),(6,6,'SECRETARIA',1,'ATIVO'),
              (7,7,'COORDENADOR',1,'ATIVO'),(71,17,'SECRETARIA',1,'ATIVO'),
              (81,18,'DIRETOR',1,'ATIVO'),(82,18,'DIRETOR',2,'ATIVO'),
              (91,19,'DIRETOR',1,'ATIVO'),(92,19,'SECRETARIA',2,'ATIVO'),
              (161,16,'DIRETOR',1,'ATIVO'),(162,16,'VICE_DIRETOR',1,'ATIVO');
              INSERT INTO acessos_administrativos(id,usuario_administrativo_id,perfil,diretoria_ensino_id,status) VALUES
              (3,3,'ADMIN_DIRETORIA',1,'ATIVO'),(4,4,'ADMIN_DIRETORIA',2,'ATIVO'),
              (8,8,'ADMIN_DIRETORIA',1,'ATIVO'),(13,13,'ADMIN_DIRETORIA',3,'ATIVO'),(72,17,'ADMIN_DIRETORIA',2,'ATIVO');
              INSERT INTO acessos_administrativos(id,usuario_administrativo_id,perfil,status) VALUES
              (2,2,'ADMIN_SEDUC','ATIVO'),(80,8,'ADMIN_SEDUC','ATIVO'),(20,20,'ADMIN_SEDUC','ATIVO');
              INSERT INTO acessos_administrativos(id,usuario_administrativo_id,perfil,unidade_escolar_id,status,data_inicio,data_fim) VALUES
              (10,10,'DIRETOR',1,'ATIVO',CURRENT_DATE+INTERVAL 1 DAY,NULL),
              (11,11,'DIRETOR',1,'ATIVO',CURRENT_DATE,NULL),
              (12,12,'DIRETOR',1,'ATIVO',CURRENT_DATE-INTERVAL 2 DAY,CURRENT_DATE-INTERVAL 1 DAY);
              INSERT INTO acessos_administrativos(id,usuario_administrativo_id,perfil,unidade_escolar_id,status) VALUES
              (101,22,'SECRETARIA',1,'ATIVO'),(102,22,'COORDENADOR',2,'ATIVO'),
              (103,22,'DIRETOR',3,'SUSPENSO'),(104,22,'SECRETARIA',3,'REVOGADO');
            """)
            app = "http://127.0.0.1:" + str(free_port())
            provider = "http://127.0.0.1:" + str(server.server_port)
            key, client_secret = secrets.token_hex(32), secrets.token_hex(32)
            secrets_used.extend((key, client_secret))
            Provider.secret = client_secret
            base = {k: os.environ[k] for k in ("PATH", "JAVA_HOME", "SystemRoot", "WINDIR") if k in os.environ}
            environment = dict(base, DB_HOST="127.0.0.1", DB_PORT=mysql_port, DB_NAME="access_check", DB_USER="root", DB_PASSWORD="",
                INTERNAL_API_SHARED_KEY=key, SESSION_SECRET=secrets.token_hex(32), REDIS_ENABLED="true", REDIS_HOST="127.0.0.1",
                REDIS_PORT=redis_port, REDIS_NAMESPACE=namespace, NODE_ENV="production", MAIL_ENABLED="false", ADMIN_SESSION_SECURE="false",
                ADMIN_SESSION_TTL_SECONDS="600", GOVBR_AUTHORIZE_URL=provider+"/authorize", GOVBR_TOKEN_URL=provider+"/token",
                GOVBR_USERINFO_URL=provider+"/userinfo", GOVBR_CLIENT_ID="isolated-access-check", GOVBR_CLIENT_SECRET=client_secret,
                GOVBR_REDIRECT_URI=app+"/auth/govbr/callback", GOVBR_LOGOUT_URL="/")
            secrets_used.append(environment["SESSION_SECRET"])

            def start(extra=()):
                with (folder / "spring.log").open("a") as log:
                    process = subprocess.Popen(["java", "-Djava.io.tmpdir="+str(folder), "-jar", str(JAR), "--server.address=127.0.0.1", "--server.port="+app.rsplit(":",1)[1], *extra],
                        cwd=folder, env=environment, stdout=log, stderr=log)
                processes.append(process)
                wait_until(lambda: process.poll() is not None or Browser().request(app+"/auth/govbr/start")[0] == 302)
                assert process.poll() is None, "Spring encerrou no startup"
                return process

            spring = start()
            check(True, "Java 21 + JAR Spring real + MySQL 8.4 tmpfs + Redis 7 temporarios + Gov.br simulado")

            def begin(account):
                browser = Browser()
                status, headers, _ = browser.request(app+"/auth/govbr/login")
                assert status == 302
                old = browser.sid()
                q = urllib.parse.parse_qs(urllib.parse.urlsplit(headers["Location"]).query)
                assert q["code_challenge_method"] == ["S256"]
                _, headers, _ = Browser().request(headers["Location"], headers={"X-Fixture-Account":str(account)})
                return browser, headers["Location"], old

            def login(account):
                browser, callback, old = begin(account)
                status, headers, raw = browser.request(callback)
                assert status == 302 and headers["Location"].endswith("/admin/dashboard"), f"Login ficticio {account}: HTTP {status}"
                assert browser.sid() and browser.sid() != old
                assert "HttpOnly" in headers["Set-Cookie"] and "SameSite=Lax" in headers["Set-Cookie"]
                assert "access_token" not in str(headers)+raw
                secrets_used.append(browser.sid())
                return browser

            users = {i:login(i) for i in (1,2,3,4,5,6,7,8,13,16,17,18,19,20)}
            check(True, "Authorization Code/PKCE real no Spring e renovacao de sessao dos perfis ficticios")

            def api(user, path="/api/admin/acessos", method="GET", data=None, expected=200, headers=None):
                browser = users[user] if isinstance(user,int) else user
                status, response_headers, raw = browser.request(app+path, method,
                    None if data is None else json.dumps(data).encode(), {"Origin":app,"Content-Type":"application/json",**(headers or {})})
                assert status == expected, f"{method} {path} (ator {user if isinstance(user,int) else 'sessao'}): esperado {expected}, recebido {status}"
                assert "application/json" in response_headers.get("Content-Type", ""), "Content-Type publico"
                assert "no-store" in response_headers.get("Cache-Control", ""), "Cache-Control publico"
                body = json.loads(raw)
                if expected >= 400:
                    assert body["success"] is False and isinstance(body.get("error"),dict)
                    assert {"code","message"} <= set(body["error"])
                    return body
                if path.split("?",1)[0].rstrip("/") == "/api/admin/cargos":
                    assert isinstance(body,list)
                    return body
                assert set(body) == {"success","data"} and body["success"] is True
                return body["data"]

            def payload(number, profile="SECRETARIA", school=1, department=None):
                value = {"cpf":fictional_cpf(number),"nome":f"Fictional Granted {number}","email":f"granted{number}@example.invalid","perfil":profile}
                if school is not None: value["unidade_escolar_id"] = school
                if department is not None: value["diretoria_ensino_id"] = department
                return value

            def counts():
                return sql("SELECT (SELECT COUNT(*) FROM usuarios_administrativos),(SELECT COUNT(*) FROM acessos_administrativos)")

            def audits():
                return [line for line in (folder/"spring.log").read_text().splitlines() if "audit_evento" in line]

            def reset_limits():
                keys = redis("--scan", "--pattern", namespace+":ponto:rate_limit:*").splitlines()
                if keys: redis("DEL", *keys)

            def contracts():
                for path in ("/api/admin/acessos","/api/admin/acessos/meu","/api/admin/acessos/capacidades","/api/admin/acessos/opcoes-concessao","/api/admin/acessos/101","/api/admin/cargos","/api/admin/qr-tokens"):
                    check(api(Browser(),path,expected=401)["error"]["code"] == "UNAUTHORIZED", "Anonimo recebe 401 JSON: "+path)
                public_fields = {"id","usuario_administrativo_id","perfil","diretoria_ensino_id","diretoria_ensino_nome","unidade_escolar_id","unidade_escolar_nome","status","data_inicio","data_fim","concedido_por_acesso_id","criado_em","atualizado_em","usuario"}
                for operator in (1,2,3,4,8,13,17):
                    result = api(operator)
                    scope = api(operator,"/api/admin/acessos/meu")
                    authorizers=[a for a in scope["acessos"] if a["perfil"] in ("ADMIN_SEDUC","ADMIN_DIRETORIA","DIRETOR","VICE_DIRETOR")]
                    global_scope=any(a["perfil"]=="ADMIN_SEDUC" for a in authorizers)
                    departments={a["diretoria_ensino_id"] for a in authorizers if a["perfil"]=="ADMIN_DIRETORIA"}
                    schools={a["unidade_escolar_id"] for a in authorizers if a["unidade_escolar_id"]}
                    clauses=["0"]
                    if departments:
                        ids=",".join(map(str,departments))
                        clauses.append("diretoria_ensino_id IN ("+ids+")")
                        schools.update(int(v) for v in sql("SELECT id FROM unidades_escolares WHERE diretoria_ensino_id IN ("+ids+")").splitlines())
                    if schools: clauses.append("unidade_escolar_id IN ("+",".join(map(str,schools))+")")
                    expected_ids={int(v) for v in sql("SELECT id FROM acessos_administrativos"+("" if global_scope else " WHERE "+" OR ".join(clauses))).splitlines()}
                    combined = api(operator,"/api/admin/acessos?limit=100")["items"]
                    check({r["id"] for r in combined} == expected_ids and result["pagination"] == {"page":1,"limit":20,"total":len(expected_ids)},f"Listagem/total e territorio reais: admin ficticio {operator}")
                    for row in combined:
                        assert set(row) == public_fields | {"acoes_permitidas"}
                        assert re.fullmatch(r"\*{3}\.\*{3}\.\*{3}-[0-9]{2}",row["usuario"]["cpf"])
                    check(True,f"Projecao de campos, CPF mascarado e acoes: admin ficticio {operator}")
                first = api(2,"/api/admin/acessos?page=1&limit=2")
                second = api(2,"/api/admin/acessos?page=2&limit=2")
                check(len(first["items"]) == len(second["items"]) == 2 and not {r["id"] for r in first["items"]}&{r["id"] for r in second["items"]},"Paginacao sem sobreposicao")
                for operator in (1,2,3,5,6,7,8,13,17):
                    own = api(operator,"/api/admin/acessos/meu/")
                    check(all("usuario" not in a and "usuario_administrativo_id" not in a for a in own["acessos"]),f"Acessos proprios nao expoem terceiros: {operator}")
                    roles = api(operator,"/api/admin/cargos/")
                    check(len(roles)==3 and all(set(r)=={"id","nome","ativo"} and isinstance(r["ativo"],bool) for r in roles),f"Cargos: lista direta e booleano real {operator}")
                caps = api(1,"/api/admin/acessos/capacidades")["perfis"]
                expected = json.loads(run("node","-e","console.log(JSON.stringify(Object.entries(require('./atesta-gateway/src/utils/adminCapabilities').CAPACIDADES_POR_PERFIL).map(([perfil,capacidades])=>({perfil,capacidades}))))",cwd=ROOT))
                check(caps==expected,"Capacidades completas e ordem iguais ao Express")
                for path in ("/api/admin/acessos/0","/api/admin/acessos/nope","/api/admin/acessos?page=0&limit=101","/api/admin/acessos?ativo=x&cargo=x"):
                    error = api(1,path,expected=422)["error"]
                    check(error["code"]=="VALIDATION_ERROR" and isinstance(error["details"],list),"Validacao publica: "+path)
                check(api(1,"/api/admin/acessos/102",expected=404)["error"]["message"] == api(1,"/api/admin/acessos/999999",expected=404)["error"]["message"],"Consulta cruzada e inexistente indistinguiveis")

            def grant():
                before = counts()
                result = api(1,method="POST",data=payload(100),expected=201)["acesso"]
                check(result["criou_identidade"] is True and result["perfil"]=="SECRETARIA" and result["data_inicio"]==sql("SELECT CURRENT_DATE"),"Concessao cria identidade/acesso e inicio padrao")
                check(sql(f"SELECT concedido_por_acesso_id FROM acessos_administrativos WHERE id={result['id']}")=="1","Concedente vem do servidor")
                duplicate = api(5,method="POST",data=payload(100,"COORDENADOR"),expected=201)["acesso"]
                check(duplicate["criou_identidade"] is False and duplicate["usuario_administrativo_id"]==result["usuario_administrativo_id"],"Identidade existente reutilizada")
                data = payload(101); data.update(status="SUSPENSO",data_inicio="2026-01-02",data_fim="2027-01-02")
                item = api(1,method="POST",data=data,expected=201)["acesso"]
                check(item["status"]=="SUSPENSO" and item["data_inicio"]=="2026-01-02" and item["data_fim"]=="2027-01-02","Status e periodo publicos preservados")
                forged = payload(102); forged.update({"adminId":2,"acessoAutorizadorId":2,"global":True,"diretorias":[2]})
                item = api(16,method="POST",data=forged,expected=201)["acesso"]
                check(sql(f"SELECT concedido_por_acesso_id FROM acessos_administrativos WHERE id={item['id']}")=="161","Campos internos ignorados; desempate por menor ID")
                item = api(8,method="POST",data=payload(103),expected=201)["acesso"]
                check(sql(f"SELECT concedido_por_acesso_id FROM acessos_administrativos WHERE id={item['id']}")=="8","DRE mais especifica escolhida antes de SEDUC")
                no_name = payload(104); no_name.pop("nome")
                check(api(1,method="POST",data=no_name,expected=400)["error"]["message"]=="nome e obrigatorio para novo usuario administrativo","Nome obrigatorio para nova identidade")
                for changes,expected in (({"cpf":"11111111111"},422),({"perfil":"UNKNOWN"},422),({"status":"PENDENTE"},422),({"data_inicio":"2026-02-30"},422),({"data_inicio":"2026-04-02","data_fim":"2026-04-01"},400)):
                    data = payload(105); data.update(changes)
                    api(1,method="POST",data=data,expected=expected)
                check(counts()!=before,"Somente concessoes validas persistem dados")

            def lifecycle():
                target = api(1,method="POST",data=payload(200),expected=201)["acesso"]["id"]
                for action,status in (("suspender","SUSPENSO"),("reativar","ATIVO"),("revogar","REVOGADO")):
                    result=api(1,f"/api/admin/acessos/{target}/{action}/","PATCH")["acesso"]
                    check(result["status"]==status and sql(f"SELECT status FROM acessos_administrativos WHERE id={target}")==status,"Transicao atomica: "+action)
                check(api(1,f"/api/admin/acessos/{target}/reativar","PATCH",expected=409)["error"]["message"]=="Acesso REVOGADO e definitivo: nao pode ser reativado","Revogacao definitiva")
                api(1,f"/api/admin/acessos/{target}/revogar","PATCH",expected=409)
                api(1,"/api/admin/acessos/1/revogar","PATCH",expected=403)
                api(1,"/api/admin/acessos/999999/suspender","PATCH",expected=404)
                check(sql("SELECT status FROM acessos_administrativos WHERE id=1")=="ATIVO","Autoalteracao recusada e fonte preservada")

            def rbac():
                rules = {2:{"ADMIN_DIRETORIA","SECRETARIA","COORDENADOR"},3:{"DIRETOR","VICE_DIRETOR","SECRETARIA","COORDENADOR"},1:{"SECRETARIA","COORDENADOR"},5:{"SECRETARIA","COORDENADOR"},6:set(),7:set()}
                profiles=("ADMIN_SEDUC","ADMIN_DIRETORIA","DIRETOR","VICE_DIRETOR","SECRETARIA","COORDENADOR")
                for operator,allowed in rules.items():
                    for j,profile in enumerate(profiles):
                        data=payload(300+operator*10+j,profile,None if profile in ("ADMIN_SEDUC","ADMIN_DIRETORIA") else 1,1 if profile=="ADMIN_DIRETORIA" else None)
                        api(operator,method="POST",data=data,expected=201 if profile in allowed else 403)
                        check(True,f"Delegacao {operator} -> {profile}: {'permitida' if profile in allowed else 'negada'}")
                for operator in (6,7):
                    api(operator,expected=403);api(operator,"/api/admin/acessos/101",expected=404);api(operator,"/api/admin/acessos/opcoes-concessao",expected=403)
                    check(True,f"Leituras por capacidade negadas para perfil sem gestao {operator}")
                for operator,school in ((1,2),(3,2),(4,1),(17,1)):
                    before=counts()
                    api(operator,method="POST",data=payload(400+operator,school=school),expected=403)
                    check(counts()==before,f"Concessao cruzada/combinar capacidades e escopos negado: {operator}")
                data=payload(420,"ADMIN_SEDUC",None);data["cpf"]=fictional_cpf(1)
                api(1,method="POST",data=data,expected=403)
                data=payload(421,"DIRETOR");data["cpf"]=fictional_cpf(1)
                api(1,method="POST",data=data,expected=403)
                check(sql("SELECT COUNT(*) FROM acessos_administrativos WHERE usuario_administrativo_id=1 AND perfil='ADMIN_SEDUC'")=="0","Autopromocao/elevacao por concessao recusadas")
                for operator in (1,3): api(operator,"/api/admin/acessos/102/revogar","PATCH",expected=403)
                api(17,"/api/admin/acessos/101/revogar","PATCH",expected=403)
                api(17,"/api/admin/acessos/102/revogar","PATCH")
                check(True,"DRE do mesmo acesso autoriza alteracao; escola de outro acesso sem capacidade nao autoriza")
                api(2,"/api/admin/acessos/1/suspender","PATCH")
                api(2,"/api/admin/acessos/1/reativar","PATCH")
                users[1]=login(1)
                check(True,"SEDUC altera direcao abaixo dele sem poder conceder DIRETOR")
                for operator in (1,2,3,5,8,13,17):
                    options=api(operator,"/api/admin/acessos/opcoes-concessao")["perfis"]
                    check(all(p["perfil"]!="ADMIN_SEDUC" and p["recursos"] for p in options),f"Opcoes sem elevacao nem recursos vazios {operator}")
                    for option in options:
                        ids={r["id"] for r in option["recursos"]}
                        if operator in (1,5): assert ids<={1}
                        if operator==3: assert ids<={1,3}
                        if operator==17: assert ids<={2}
                    check(True,f"Opcoes filtradas pelo territorio do mesmo acesso {operator}")

            def csrf():
                before=counts();audit_before=len(audits())
                for method,path,data in (("POST","/api/admin/acessos",payload(500)),("PATCH","/api/admin/acessos/101/suspender",None),("POST","/api/admin/qr-tokens",None)):
                    for origin in (None,"null","https://evil.invalid",app+".evil"):
                        headers={"Content-Type":"application/json"}
                        if origin is not None: headers["Origin"]=origin
                        status,_,raw=users[1].request(app+path,method,None if data is None else json.dumps(data).encode(),headers)
                        check(status==403 and json.loads(raw)["error"]["code"]=="FORBIDDEN",f"CSRF {method} {path}, origem {origin or 'ausente'}")
                check(counts()==before and len(audits())==audit_before,"CSRF sem escrita ou auditoria de sucesso")
                result=users[1].request(app+"/api/admin/acessos","POST",json.dumps(payload(501)).encode(),{"Content-Type":"application/json","Referer":app+"/admin/acessos"})
                check(result[0]==201,"Referer de mesma origem preservado")

            def sessions():
                for account in (9,10,11,12):
                    browser,callback,_=begin(account)
                    check(browser.request(callback)[0]==403 and api(browser,expected=401)["error"]["code"]=="UNAUTHORIZED",f"Login fail-closed: sem acesso/futuro/inativo/expirado {account}")
                browser,callback,_=begin(1)
                parsed=urllib.parse.urlsplit(callback);q=urllib.parse.parse_qs(parsed.query);q["state"]=["forged"]
                forged=urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(q,doseq=True)))
                check(browser.request(forged)[0]==401 and api(browser,expected=401),"OAuth state adulterado invalida sessao")
                for statement,restore in (("UPDATE usuarios_administrativos SET ativo=0 WHERE id=1","UPDATE usuarios_administrativos SET ativo=1 WHERE id=1"),
                        ("UPDATE acessos_administrativos SET status='REVOGADO' WHERE id=1","UPDATE acessos_administrativos SET status='ATIVO' WHERE id=1"),
                        ("UPDATE acessos_administrativos SET data_fim=CURRENT_DATE-INTERVAL 1 DAY,data_inicio=CURRENT_DATE-INTERVAL 2 DAY WHERE id=1","UPDATE acessos_administrativos SET data_inicio=CURRENT_DATE,data_fim=NULL WHERE id=1")):
                    browser=login(1)
                    try:
                        sql(statement);api(browser,expected=401)
                        check(True,"Sessao revalida identidade, status e vigencia persistidos")
                    finally: sql(restore)
                    api(browser,expected=401)
                browser=login(1);check(browser.request(app+"/auth/govbr/logout","POST",headers={"Origin":app})[0]==302,"Logout de origem valida")
                api(browser,expected=401)
                users[1]=login(1)

            def lock_row(table,row):
                client=subprocess.Popen(["docker","exec","-i",mysql_name,"mysql","--protocol=TCP","-h127.0.0.1","--unbuffered","-uroot","-N","access_check"],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                clients.append(client)
                client.stdin.write(f"START TRANSACTION; SELECT id FROM {table} WHERE id={row} FOR UPDATE; SELECT 'LOCK_READY';\n");client.stdin.flush()
                assert client.stdout.readline().strip()==str(row) and client.stdout.readline().strip()=="LOCK_READY"
                return client

            def release(client,statement=""):
                client.stdin.write((statement+";" if statement else "")+"COMMIT;\n");client.stdin.close()
                assert client.wait(timeout=10)==0,"Cliente de lock nao concluiu"

            def wait_lock(minimum=1):
                wait_until(lambda:int(sql("SELECT COUNT(*) FROM performance_schema.data_lock_waits"))>=minimum,timeout=6)

            def race_revoke():
                for method,path,data in (("POST","/api/admin/acessos",payload(600)),("PATCH","/api/admin/acessos/101/suspender",None),("POST","/api/admin/qr-tokens",None)):
                    users[1]=login(1);before=counts();status_before=sql("SELECT status FROM acessos_administrativos WHERE id=101");audit_before=len(audits())
                    qr_before=redis("GET",namespace+":ponto:qr:unit:"+hashlib.sha256(b"1").hexdigest())
                    lock=lock_row("usuarios_administrativos",1)
                    try:
                        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                            pending=pool.submit(api,1,path,method,data,403)
                            try:
                                wait_lock()
                                release(lock,"UPDATE acessos_administrativos SET status='REVOGADO' WHERE id=1")
                            finally:
                                if not lock.stdin.closed: release(lock)
                            pending.result(12)
                        check(counts()==before and sql("SELECT status FROM acessos_administrativos WHERE id=101")==status_before and len(audits())==audit_before,"Revogacao concorrente bloqueia mutacao e auditoria: "+path)
                        check(redis("GET",namespace+":ponto:qr:unit:"+hashlib.sha256(b"1").hexdigest())==qr_before,"Revogacao concorrente nao publica QR: "+path)
                    finally:
                        sql("UPDATE acessos_administrativos SET status='ATIVO' WHERE id=1");users[1]=login(1)

                # Enfileira a revogacao HTTP antes da concessao para observar a leitura corrente apos o commit.
                before=counts();audit_before=len(audits());lock=lock_row("usuarios_administrativos",1)
                try:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                        revoke=pool.submit(api,2,"/api/admin/acessos/1/revogar","PATCH",None,200)
                        try:
                            wait_lock()
                            grant_pending=pool.submit(api,1,"/api/admin/acessos","POST",payload(601),403)
                            wait_lock(2);release(lock)
                        finally:
                            if not lock.stdin.closed: release(lock)
                        revoke.result(12);grant_pending.result(12)
                    check(sql("SELECT status FROM acessos_administrativos WHERE id=1")=="REVOGADO" and counts()==before,
                        "Revogacao pela API publica vence concessao concorrente e impede identidade/acesso novos")
                    added=audits()[audit_before:]
                    check(len(added)==1 and "evento=acesso_administrativo_revogar " in added[0],
                        "Concorrencia HTTP audita apenas revogacao confirmada, nunca concessao recusada")
                finally:
                    sql("UPDATE acessos_administrativos SET status='ATIVO' WHERE id=1");users[1]=login(1)

            def race_status():
                target=api(1,method="POST",data=payload(610),expected=201)["acesso"]["id"]
                audit_before=len(audits());lock=lock_row("acessos_administrativos",target)
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    pending=pool.submit(api,1,f"/api/admin/acessos/{target}/suspender","PATCH",None,409)
                    try:
                        wait_lock();release(lock,f"UPDATE acessos_administrativos SET status='REVOGADO' WHERE id={target}")
                    finally:
                        if not lock.stdin.closed: release(lock)
                    pending.result(12)
                check(sql(f"SELECT status FROM acessos_administrativos WHERE id={target}")=="REVOGADO" and len(audits())==audit_before,"Status concorrente nao e sobrescrito; conflito 409 sem auditoria de sucesso")

            def rollback():
                before=counts();audit_before=len(audits())
                sql("CREATE TRIGGER isolated_access_rollback AFTER INSERT ON acessos_administrativos FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback'")
                try:
                    api(1,method="POST",data=payload(700),expected=500)
                    check(counts()==before and sql(f"SELECT COUNT(*) FROM usuarios_administrativos WHERE cpf='{fictional_cpf(700)}'")=="0" and len(audits())==audit_before,"Rollback concessao desfaz identidade+acesso e nao audita sucesso")
                finally: sql("DROP TRIGGER isolated_access_rollback")
                target=api(1,method="POST",data=payload(701),expected=201)["acesso"]["id"];audit_before=len(audits())
                sql("CREATE TRIGGER isolated_access_update AFTER UPDATE ON acessos_administrativos FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback'")
                try:
                    api(1,f"/api/admin/acessos/{target}/suspender","PATCH",expected=500)
                    check(sql(f"SELECT status FROM acessos_administrativos WHERE id={target}")=="ATIVO" and len(audits())==audit_before,"Rollback de status preserva estado e nao audita sucesso")
                finally: sql("DROP TRIGGER isolated_access_update")

            def signed(method,path,body=b"",timestamp=None):
                timestamp=str(timestamp if timestamp is not None else int(time.time()));rid=str(uuid.uuid4())
                canonical="\n".join((method,path,timestamp,rid,hashlib.sha256(body).hexdigest()))
                return {"Content-Type":"application/json","X-Internal-Timestamp":timestamp,"X-Internal-Request-Id":rid,"X-Internal-Signature":hmac.new(key.encode(),canonical.encode(),hashlib.sha256).hexdigest()}

            def internal(path,data):
                body=json.dumps(data).encode();status,_,raw=Browser().request(app+path,"POST",body,signed("POST",path,body))
                assert status==200,f"HTTP interno assinado: {status}"
                return json.loads(raw)

            def qr():
                check(api(1,"/api/admin/qr-tokens")["qrCode"] is None,"QR atual ausente retorna null")
                initial=api(6,"/api/admin/qr-tokens/","POST")["qrCode"]
                old=urllib.parse.parse_qs(urllib.parse.urlsplit(initial["url"]).query)["qr"][0];secrets_used.append(old)
                check(initial["unidade_escolar_id"]==1 and re.fullmatch(r"[a-f0-9]{64}",old) is not None,"QR gerado: URL e unidade publicas")
                check(api(1,"/api/admin/qr-tokens")["qrCode"]==initial,"QR atual consistente entre perfis da mesma escola")
                check(internal("/internal/escolas/qr/resolver",{"token":old})["unidade"]=={"unidade_escolar_id":1},"QR original valido no resolvedor real")
                regenerated=api(1,"/api/admin/qr-tokens","POST",{"unidade_escolar_id":2,"adminId":2})["qrCode"]
                new=urllib.parse.parse_qs(urllib.parse.urlsplit(regenerated["url"]).query)["qr"][0];secrets_used.append(new)
                check(old!=new and regenerated["unidade_escolar_id"]==1,"Regeneracao usa escola do acesso; body nao concede territorio")
                check(internal("/internal/escolas/qr/resolver",{"token":old})["unidade"] is None,"QR antigo perde validade apos regeneracao")
                check(internal("/internal/escolas/qr/resolver",{"token":new})["unidade"]=={"unidade_escolar_id":1},"Novo QR valido apos regeneracao")
                old_key=namespace+":ponto:qr:token:"+hashlib.sha256(old.encode()).hexdigest()
                check(redis("EXISTS",old_key)=="0","Indice do token antigo removido atomicamente do Redis")
                for operator in (2,3,4,7,13):
                    api(operator,"/api/admin/qr-tokens",expected=403);api(operator,"/api/admin/qr-tokens","POST",expected=403)
                    check(True,f"QR negado para perfil sem capacidade escolar {operator}")
                for operator in (18,19):
                    error=api(operator,"/api/admin/qr-tokens","POST",expected=409)["error"]
                    check(error["code"]=="CONFLICT" and error["details"]=={"unidades_escolares_ids":[1,2]},"QR ambiguo exige resolucao explicita")
                check(api(17,"/api/admin/qr-tokens?unidade_escolar_id=2","POST")["qrCode"]["unidade_escolar_id"]==1,"QR nao combina capacidade escolar e DRE de outro acesso")

            def hmac_checks():
                operations=(("POST","/internal/acessos-administrativos/consultar",{"id":101}),
                    ("POST","/internal/escolas/qr/atual",{"unidade_escolar_id":1}),
                    ("GET","/internal/cargos",None))
                for method,path,data in operations:
                    body=b"" if data is None else json.dumps(data).encode()
                    check(users[2].request(app+path,method,body,{"Content-Type":"application/json"})[0]==401,"Cookie publico nao substitui HMAC: "+path)
                    headers=signed(method,path,body)
                    status,_,raw=Browser().request(app+path,method,body,headers)
                    check(status==200 and (isinstance(json.loads(raw),list) or "success" not in json.loads(raw)),"HMAC valido preserva contrato interno: "+path)
                    check(Browser().request(app+path,method,body,headers)[0]==401,"Replay HMAC rejeitado: "+path)
                    headers=signed(method,path,body);headers["X-Internal-Signature"]="0"*64
                    check(Browser().request(app+path,method,body,headers)[0]==401,"HMAC adulterado rejeitado: "+path)
                    check(Browser().request(app+path,method,body,signed(method,path,body,int(time.time())-120))[0]==401,"Timestamp expirado rejeitado: "+path)

            def abuse():
                audit_before=len(audits())
                for _ in range(40): api(7,"/api/admin/qr-tokens","POST",expected=403)
                error=api(7,method="POST",data=payload(800),expected=429)["error"]
                check(error["code"]=="RATE_LIMITED" and len(audits())==audit_before,"Cota sensivel de 40 compartilhada entre acesso e QR, inclusive negacoes")
                body=payload(801)
                status,headers,_=users[7].request(app+"/api/admin/acessos","POST",json.dumps(body).encode(),{"Origin":app,"Content-Type":"application/json"})
                check(status==429 and int(headers["Retry-After"])>0 and "sensitive" in ",".join(headers.get_all("RateLimit",[])),"Headers de limite e Retry-After preservados")
                keys=redis("--scan","--pattern",namespace+":ponto:rate_limit:sensitive:*").splitlines()
                check(keys and all(re.fullmatch(r"[a-f0-9]{64}",k.rsplit(":",1)[1]) for k in keys),"Cotas reais no Redis sem identidade em claro nas chaves")
                run("docker","pause",redis_name)
                try:
                    error=api(2,expected=503)["error"]
                    check(error["code"]=="RATE_LIMIT_UNAVAILABLE","Redis indisponivel falha fechado em producao")
                finally: run("docker","unpause",redis_name)
                api(2);check(True,"Redis recuperado permite consultas sem fallback em memoria")

            def expiry():
                spring.terminate();spring.wait(timeout=15)
                process=start(("--admin.session.ttl-seconds=1",))
                browser=login(1);time.sleep(1.1)
                api(browser,expected=401)
                check(process.poll() is None,"TTL absoluto expirado invalida sessao Spring")

            for group,action in (("contracts",contracts),("grant",grant),("lifecycle",lifecycle),("rbac",rbac),("csrf",csrf),
                    ("sessions",sessions),("race-revoke",race_revoke),("race-status",race_status),("rollback",rollback),
                    ("qr",qr),("hmac",hmac_checks),("abuse",abuse),("expiry",expiry)):
                if group not in selected: continue
                current=group
                reset_limits()
                try: action()
                except Exception as error:
                    message=safe(type(error).__name__+": "+str(error))
                    results.append(("FALHOU",current,message));print("FALHOU "+current+": "+message,flush=True)
            current="audit"
            logs=(folder/"spring.log").read_text()
            secrets_used.extend(Provider.tokens)
            check(all(secret not in logs for secret in secrets_used),"Logs sem chaves OAuth/HMAC/sessao ou tokens de QR")
            check(not any(fictional_cpf(i) in logs for i in range(1,900)) and "@example.invalid" not in logs,
                "Logs nao expoem CPF ou email ficticios em claro")
            audit_lines=audits()
            check(all(not re.search(r"cpf=|email=|qr=|[a-f0-9]{64}",line) for line in audit_lines),"Auditoria sem CPF/email/token ou URL de QR")
            if {"grant","lifecycle","qr"} <= selected:
                for event in ("acesso_administrativo_concedido","acesso_administrativo_suspender","acesso_administrativo_reativar","acesso_administrativo_revogar","qr_code_escolar_gerado"):
                    check(any("evento="+event+" " in line for line in audit_lines),"Evento de auditoria registrado: "+event)
            check(all("adminId=" in line and "ipOrigem=" in line for line in audit_lines),"Auditoria identifica operador e origem sem payload sensivel")
        except Exception as error:
            message=safe(type(error).__name__+": "+str(error))
            results.append(("BLOQUEADO",current,message));print("BLOQUEADO "+current+": "+message,flush=True)
            if (folder/"spring.log").exists():
                relevant="\n".join(line for line in (folder/"spring.log").read_text().splitlines() if "ERROR" in line or "Caused by:" in line)[-2000:]
                if relevant: print(safe(relevant),flush=True)
        finally:
            for client in clients:
                if client.poll() is None:
                    if not client.stdin.closed: client.stdin.write("ROLLBACK;\n");client.stdin.close()
                    client.wait(timeout=15)
            for process in reversed(processes):
                if process.poll() is None:
                    process.terminate()
                    try: process.wait(timeout=15)
                    except subprocess.TimeoutExpired: process.kill();process.wait()
            server.shutdown();server.server_close()
            for container in reversed(containers):
                run("docker","rm","-f",container)
            current="cleanup"
            check(run(*SNAPSHOT)==baseline,"mysql-dev e node-dev: mesmos IDs, estados, inicio e reinicios")
            check(all(p.exists() and hashlib.sha256(p.read_bytes()).digest()==digest for p,digest in protected.items()),".env preservados byte a byte")
            remaining=run("docker","ps","-a","--format","{{.Names}}")
            check(all(name not in remaining.splitlines() for name in containers),"Somente MySQL/Redis temporarios removidos; Spring/cliente SQL/Gov.br encerrados")
            lines=["", "## Rodada UTC "+datetime.datetime.now(datetime.timezone.utc).isoformat(), "", "Grupos: "+(args.only or "todos")+".", "", "| Resultado | Grupo | Cenario |", "|---|---|---|"]
            lines.extend(f"| {status} | {group} | {description.replace('|','/').replace(chr(10),' ')} |" for status,group,description in results)
            lines.extend(["", "Totais: "+"; ".join(f"{s}={sum(r==s for r,_,_ in results)}" for s in ("PASSOU","FALHOU","BLOQUEADO"))+".", ""])
            if not REPORT.exists():
                REPORT.write_text("# Homologacao Spring — acessos, cargos e QR\n\nHTTP direto no Spring real com Java 21, MySQL 8.4 e Redis 7 descartaveis em tmpfs,\nGov.br Python simulado e dados ficticios. Nao usa Express nem carrega .env.\n\nReproduzir: `./mvnw -o -DskipTests package && python3 scripts/check-public-access-qr.py`.\nRepetir grupos afetados: `python3 scripts/check-public-access-qr.py --only race-revoke,rollback`.\nImagens locais: `mysql:8.4`, `redis:7-alpine`; Docker e Java 21 necessarios.\nCotas Redis sao resetadas entre grupos para isolar cenarios; grupo abuse testa o limite real.\nSem commit, merge, push ou deploy.\n")
            with REPORT.open("a") as output: output.write("\n".join(lines))
    if any(status!="PASSOU" for status,_,_ in results): raise SystemExit(1)
    print(f"PASSOU {len(results)} verificacoes; {REPORT.relative_to(ROOT)}",flush=True)


if __name__=="__main__":
    main()
