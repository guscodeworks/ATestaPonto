#!/usr/bin/env python3
"""Spring HTTP real + MySQL descartavel + Gov.br/CEP Python locais, sem Express.

Requer Java 21, Docker e JAR empacotado. Nao carrega .env. --only seleciona
os grupos afetados para reexecucao. O relatorio acumula rodadas e correcoes.
"""
import argparse
import base64
import concurrent.futures
import datetime
import hashlib
import hmac
import http.server
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import uuid

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("auth_support", Path(__file__).with_name("check-admin-auth.py"))
SUPPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUPPORT)
Browser, run, wait_until, free_port = SUPPORT.Browser, SUPPORT.run, SUPPORT.wait_until, SUPPORT.free_port
ROOT, JAR = SUPPORT.ROOT, SUPPORT.JAR
REPORT = ROOT / "backend-spring/HOMOLOGACAO-ESCOLAS-DIRETORIAS.md"
SNAPSHOT = ["docker", "inspect", "--format", "{{.Name}} {{.Id}} {{.State.Status}} {{.State.StartedAt}} {{.RestartCount}}", "mysql-dev", "node-dev"]


class Provider(http.server.BaseHTTPRequestHandler):
    codes, tokens, gates = {}, {}, {}
    cep_calls = 0
    secret = ""

    def log_message(self, *_):
        pass

    def reply(self, status, data=None, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        try:
            self.wfile.write(json.dumps(data or {}).encode())
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path == "/authorize":
            q = urllib.parse.parse_qs(url.query)
            assert q["code_challenge_method"] == ["S256"]
            code = secrets.token_urlsafe(32)
            self.codes[code] = (q, self.headers.get("X-Fixture-Account", "1"))
            return self.reply(302, headers={"Location": q["redirect_uri"][0] + "?" + urllib.parse.urlencode({"state": q["state"][0], "code": code})})
        if url.path == "/userinfo":
            account = self.tokens.get(self.headers.get("Authorization", "").removeprefix("Bearer "))
            if account is None:
                return self.reply(401)
            return self.reply(200, {"sub": "fictional-" + account, "cpf": f"1000000{int(account):04d}"})
        if url.path.startswith("/api/cep/v2/"):
            type(self).cep_calls += 1
            cep = url.path.rsplit("/", 1)[1]
            if cep in self.gates:
                entered, release = self.gates[cep]
                entered.set()
                if not release.wait(7):
                    return self.reply(503)
            if cep == "13010999":
                return self.reply(404)
            if cep == "13010998":
                return self.reply(503)
            if cep == "13010997":
                return self.reply(200, {"cep": "wrong"})
            if cep == "13010996":
                time.sleep(2)
            data = {"cep": cep, "state": "SP", "city": "Fictional City", "neighborhood": "Fictional District", "street": "Fictional Street", "service": "fixture"}
            if cep != "13010995":
                data["location"] = {"type": "Point", "coordinates": {"latitude": "-22.9" if cep != "13010994" else "80", "longitude": "-47.1"}}
            return self.reply(200, data)
        self.reply(404)

    def do_POST(self):
        form = urllib.parse.parse_qs(self.rfile.read(int(self.headers.get("Content-Length", "0"))).decode())
        saved = self.codes.pop(form.get("code", [""])[0], None)
        if self.path != "/token" or saved is None:
            return self.reply(400)
        q, account = saved
        challenge = base64.urlsafe_b64encode(hashlib.sha256(form.get("code_verifier", [""])[0].encode()).digest()).decode().rstrip("=")
        if challenge != q["code_challenge"][0] or form.get("redirect_uri") != q["redirect_uri"] or form.get("client_secret") != [self.secret]:
            return self.reply(401)
        token = secrets.token_urlsafe(32)
        self.tokens[token] = account
        self.reply(200, {"access_token": token, "token_type": "Bearer"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="Grupos separados por virgula; fixture e limpeza sempre executadas")
    args = parser.parse_args()
    selected = set(args.only.split(",")) if args.only else None
    results, processes, clients = [], [], []
    name = "atesta-school-check-" + uuid.uuid4().hex[:12]
    created = False
    protected = {p: hashlib.sha256(p.read_bytes()).digest() for p in ROOT.rglob(".env") if "node_modules" not in p.parts}
    baseline = run(*SNAPSHOT)
    assert SUPPORT.java21() and JAR.is_file(), "Empacote com Java 21 primeiro"
    secrets_used = []
    current = "infra"

    def check(condition, description):
        if not condition:
            raise AssertionError(description)
        results.append(("PASSOU", current, description))
        print("PASSOU " + current + ": " + description, flush=True)

    def scenario(group, action):
        nonlocal current
        if selected is not None and group not in selected:
            return
        current = group
        try:
            action()
        except Exception as failure:
            message = str(failure)
            for secret in secrets_used:
                message = message.replace(secret, "[redacted]")
            results.append(("FALHOU", group, message[:1200]))
            print("FALHOU " + group + ": " + message[:1200], flush=True)

    with tempfile.TemporaryDirectory(prefix="atesta-school-http-") as temporary:
        folder = Path(temporary)
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        server.daemon_threads = True
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            run("docker", "run", "--rm", "-d", "--name", name,
                "--label", "atestaponto.purpose=public-school-homologation", "--memory", "512m",
                "--tmpfs", "/var/lib/mysql:rw,size=512m", "-p", "127.0.0.1::3306",
                "-e", "MYSQL_ALLOW_EMPTY_PASSWORD=yes", "-e", "MYSQL_DATABASE=school_check",
                "mysql:8.4", "--innodb-buffer-pool-size=64M")
            created = True
            port = run("docker", "port", name, "3306/tcp").rsplit(":", 1)[1]

            def sql(statement):
                try:
                    return run("docker", "exec", "-i", name, "mysql", "-uroot", "-N", "school_check", input=statement)
                except subprocess.CalledProcessError as failure:
                    raise RuntimeError(failure.stderr.strip()) from None

            def database_ready():
                try:
                    return sql("SELECT 1") == "1"
                except RuntimeError:
                    return False

            wait_until(database_ready)
            sql((ROOT / "atesta-gateway/database/schema/ponto.sql").read_text())
            sql("""
              INSERT INTO diretorias_ensino(id,nome,codigo,cidade_sede,ativo) VALUES
              (1,'Fictional DRE A','DRE-A','Fictional City',1),(2,'Fictional DRE B','DRE-B','Fictional City',1),
              (3,'Fictional DRE Empty','DRE-E','Fictional City',1),(4,'Fictional DRE Inactive','DRE-I','Fictional City',0);
              INSERT INTO unidades_escolares(id,diretoria_ensino_id,nome,latitude,longitude,ativa,codigo_inep) VALUES
              (1,1,'Fictional School A',-22.9,-47.1,1,'10000001'),(2,2,'Fictional School B',-22.9,-47.1,1,'10000002'),
              (3,1,'Fictional School C',-22.9,-47.1,1,NULL),(4,1,'Fictional School Inactive',-22.9,-47.1,0,NULL);
            """)
            for i in range(1, 16):
                sql(f"INSERT INTO usuarios_administrativos(id,cpf,nome,email,ativo) VALUES ({i},'1000000{i:04d}','Fictional Admin {i}','fictional{i}@example.invalid',{0 if i == 11 else 1})")
            sql("""
              INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,unidade_escolar_id,status) VALUES
              (1,'DIRETOR',1,'ATIVO'),(5,'VICE_DIRETOR',1,'ATIVO'),(6,'SECRETARIA',1,'ATIVO'),(7,'COORDENADOR',1,'ATIVO');
              INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,diretoria_ensino_id,status) VALUES
              (3,'ADMIN_DIRETORIA',1,'ATIVO'),(4,'ADMIN_DIRETORIA',2,'ATIVO'),(8,'ADMIN_DIRETORIA',1,'ATIVO'),(13,'ADMIN_DIRETORIA',3,'ATIVO');
              INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,status) VALUES (2,'ADMIN_SEDUC','ATIVO'),(8,'ADMIN_SEDUC','ATIVO');
              INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,unidade_escolar_id,status,data_inicio,data_fim) VALUES
              (10,'DIRETOR',1,'ATIVO',CURRENT_DATE + INTERVAL 1 DAY,NULL),
              (11,'DIRETOR',1,'ATIVO',CURRENT_DATE,NULL),(12,'DIRETOR',1,'ATIVO',CURRENT_DATE - INTERVAL 2 DAY,CURRENT_DATE - INTERVAL 1 DAY);
              ALTER TABLE acessos_administrativos DROP CHECK chk_acessos_escopo;
              INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,status) VALUES (14,'DIRETOR','ATIVO');
              SET SESSION sql_mode='';
              INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,status) VALUES (15,'UNKNOWN','ATIVO');
            """)
            app = f"http://127.0.0.1:{free_port()}"
            provider = f"http://127.0.0.1:{server.server_port}"
            key, client_secret = secrets.token_hex(32), secrets.token_hex(32)
            secrets_used.extend((key, client_secret))
            Provider.secret = client_secret
            base = {k: os.environ[k] for k in ("PATH", "JAVA_HOME", "SystemRoot", "WINDIR") if k in os.environ}
            environment = dict(base, DB_HOST="127.0.0.1", DB_PORT=port, DB_NAME="school_check", DB_USER="root", DB_PASSWORD="",
                INTERNAL_API_SHARED_KEY=key, REDIS_ENABLED="false", MAIL_ENABLED="false", ADMIN_SESSION_SECURE="false",
                ADMIN_SESSION_TTL_SECONDS="600", GOVBR_AUTHORIZE_URL=provider + "/authorize", GOVBR_TOKEN_URL=provider + "/token",
                GOVBR_USERINFO_URL=provider + "/userinfo", GOVBR_CLIENT_ID="school-check", GOVBR_CLIENT_SECRET=client_secret,
                GOVBR_REDIRECT_URI=app + "/auth/govbr/callback", GOVBR_LOGOUT_URL="/", BRASILAPI_BASE_URL=provider,
                BRASILAPI_CONNECT_TIMEOUT="1s", BRASILAPI_READ_TIMEOUT="1s")

            def start(extra=()):
                with (folder / "spring.log").open("a") as log:
                    process = subprocess.Popen(["java", "-jar", str(JAR), "--server.address=127.0.0.1", "--server.port=" + app.rsplit(":", 1)[1], *extra], cwd=folder, env=environment, stdout=log, stderr=log)
                processes.append(process)
                wait_until(lambda: process.poll() is not None or Browser().request(app + "/auth/govbr/start")[0] == 302)
                assert process.poll() is None, "Spring encerrou no startup"
                return process

            spring = start()
            check(True, "Java 21, MySQL 8.4 tmpfs e Spring real; somente mocks Python em localhost")

            def begin(account):
                browser = Browser()
                status, headers, _ = browser.request(app + "/auth/govbr/login")
                assert status == 302
                old_sid = browser.sid()
                query = urllib.parse.parse_qs(urllib.parse.urlsplit(headers["Location"]).query)
                assert query["code_challenge_method"] == ["S256"]
                _, headers, _ = Browser().request(headers["Location"], headers={"X-Fixture-Account": str(account)})
                return browser, headers["Location"], old_sid

            def login(account):
                browser, callback, old_sid = begin(account)
                status, headers, raw = browser.request(callback)
                assert status == 302 and headers["Location"].endswith("/admin/dashboard"), f"Login {account}: HTTP {status}"
                assert browser.sid() and browser.sid() != old_sid
                assert "HttpOnly" in headers["Set-Cookie"] and "SameSite=Lax" in headers["Set-Cookie"]
                assert "access_token" not in str(headers) + raw
                return browser

            users = {i: login(i) for i in (1, 2, 3, 4, 5, 6, 7, 8, 13)}
            check(True, "Login Authorization Code/PKCE e renovacao de sessao dos perfis de homologacao")

            def api(user, path="/api/admin/escolas", method="GET", data=None, expected=200, problem=False, headers=None):
                browser = users[user] if isinstance(user, int) else user
                options = {"Origin": app, "Content-Type": "application/json", **(headers or {})}
                status, response_headers, raw = browser.request(app + path, method, None if data is None else json.dumps(data).encode(), options)
                assert status == expected, f"{method} {path}: esperado {expected}, recebido {status}: {raw[:650]}"
                assert "application/json" in response_headers.get("Content-Type", ""), response_headers.get("Content-Type", "")
                body = json.loads(raw)
                assert "no-store" in response_headers.get("Cache-Control", ""), "Cache-Control sem no-store"
                if problem:
                    assert body["status"] == expected and body["instance"] == ("/internal/escolas/preview" if "/preview" in path else "/internal/escolas"), body
                elif expected >= 400:
                    assert body["success"] is False and set(body["error"]) == {"code", "message", "details"}, body
                elif method == "POST" and path.rstrip("/") in ("/api/admin/escolas", "/api/admin/escolas/preview"):
                    assert "success" not in body
                else:
                    assert body["success"] is True and set(body) == {"success", "data"}, body
                    return body["data"]
                return body

            def school(number, department=1, cep="13010100"):
                return {"nome": f"Fictional Created School {number}", "diretoria_ensino_id": department, "cep": cep,
                        "codigo_inep": str(20000000 + number), "raio_permitido_metros": 125}

            def dre(number):
                return {"nome": f"Fictional Created DRE {number}", "codigo": f"CREATED-{number}", "cidade_sede": "Fictional City"}

            def counts():
                return sql("SELECT (SELECT COUNT(*) FROM unidades_escolares),(SELECT COUNT(*) FROM diretorias_ensino)")

            def read():
                check({r["id"] for r in api(2)["items"]} == {1, 2, 3, 4}, "SEDUC lista todas as escolas; contrato de itens e paginacao")
                check({r["id"] for r in api(3)["items"]} == {1, 3, 4}, "DRE A lista apenas escolas da propria diretoria, incluindo inativas")
                check({r["id"] for r in api(4)["items"]} == {2}, "DRE B lista apenas escola B")
                for i in (1, 5, 6, 7):
                    check({r["id"] for r in api(i)["items"]} == {1}, f"Perfil escolar {i} restrito a propria escola")
                check(api(13)["items"] == [], "Escopo de DRE sem unidades retorna vazio, sem acesso global")
                check(api(2,"/api/admin/escolas?ativa=0")["items"][0]["id"] == 4, "Filtro ativa=0")
                check(api(2,"/api/admin/escolas?diretoria_ensino_id=2&q=School&limit=1&page=1")["pagination"] == {"page": 1,"limit": 1,"total": 1}, "Filtros DRE/q e paginacao")
                check(api(2,"/api/admin/escolas?q=%25")["items"] == [], "LIKE escapa curingas fornecidos pelo cliente")
                check(api(3,"/api/admin/escolas?escopo_global=true&unidades_escolares_ids=2&diretoria_ensino_id=2")["items"] == [], "Parametros de escopo do navegador nao ampliam territorio")
                item = api(3,"/api/admin/escolas/1/")
                check(set(item) == {"id","diretoria_ensino_id","diretoria_ensino_nome","nome","codigo_inep","endereco","cidade","latitude","longitude","raio_permitido_metros","ativa","criado_em","atualizado_em"} and item["criado_em"].endswith("Z"), "Consulta individual preserva JSON e timestamps do Express")
                api(3,"/api/admin/escolas/2",expected=403)
                api(3,"/api/admin/escolas/9999",expected=403)
                check(True, "Consulta externa e inexistente retornam igualmente 403")
                check({r["id"] for r in api(3,"/api/admin/escolas/diretorias")["items"]} == {1}, "Seletor de cadastro limitado a DRE ativa autorizada")
                api(2,"/api/admin/escolas/",expected=200)

            def preview_cep():
                old = counts()
                address = api(3,"/api/admin/escolas/cep/13.010-100")
                check(set(address) == {"cep","logradouro","bairro","cidade","uf","latitude","longitude","geolocalizacao_disponivel"} and address["geolocalizacao_disponivel"], "CEP formatado retorna campos publicos e coordenadas")
                check(api(3,"/api/admin/escolas/cep/13010995")["latitude"] is None, "CEP sem geolocalizacao retorna null")
                preview = api(3,"/api/admin/escolas/preview","POST",school(1))
                check(preview["diretoria_ensino_id"] == 1 and preview["origem_coordenadas"] == "BRASILAPI" and not preview["localizacao_pendente"], "Previa usa CEP no servidor e retorna JSON direto do dominio")
                check(api(3,"/api/admin/escolas/preview","POST",school(2,cep="13010995"))["localizacao_pendente"], "Previa sem coordenadas informa localizacao pendente")
                check(counts() == old, "CEP e previa nao gravam registros")
                for cep, status, code in (("11111111",422,"VALIDATION_ERROR"),("13010999",404,"CEP_NAO_ENCONTRADO"),("13010998",502,"CEP_INDISPONIVEL"),("13010997",502,"CEP_INDISPONIVEL"),("13010996",502,"CEP_INDISPONIVEL")):
                    check(api(3,"/api/admin/escolas/cep/"+cep,expected=status)["error"]["code"] == code, f"CEP {cep}: erro e status {status} preservados")
                api(3,"/api/admin/escolas/preview","POST",school(3,cep="13010994"),502,problem=True)
                check(True, "Coordenadas externas ao Brasil rejeitadas na previa")

            def create_school():
                form = school(10)
                form.update(latitude=80,longitude=150,endereco="Forged Street",ativa=False)
                created = api(3,method="POST",data=form,expected=201)
                check(created["latitude"] == -22.9 and created["longitude"] == -47.1 and created["endereco"] == "Fictional Street" and created["ativa"], "Cadastro recalcula endereco/coordenadas/estado e ignora valores forjados")
                check(api(3,"/api/admin/escolas/"+str(created["id"]))["id"] == created["id"], "Escola criada consultavel na propria DRE")
                api(4,"/api/admin/escolas/"+str(created["id"]),expected=403)
                api(3,method="POST",data=school(10),expected=409,problem=True)
                form=school(11);form["codigo_inep"]="20000010"
                api(3,method="POST",data=form,expected=409,problem=True)
                check(True,"Conflitos de nome e codigo INEP retornam 409, sem duplicar escola")

            def departments():
                rows=api(2,"/api/admin/diretorias")["items"]
                check(all(set(r)=={"id","nome","codigo","cidade_sede","ativo"} for r in rows),"Listagem de DRE projeta somente campos publicos")
                check({r["id"] for r in api(2,"/api/admin/diretorias?ativo=false")["items"]}=={4},"Filtro de DRE inativa")
                row=api(2,"/api/admin/diretorias/","POST",dre(10),201);identity=row["id"]
                edited=dre(11);edited["nome"]="  Fictional Edited DRE 11  "
                check(api(2,f"/api/admin/diretorias/{identity}/","PUT",edited)["nome"]==edited["nome"].strip(),"Cadastro 201 e edicao PUT 200 de DRE com normalizacao")
                check(not api(2,f"/api/admin/diretorias/{identity}/status","PUT",{"ativo":False})["ativo"],"Desativacao de DRE sem dependencias")
                api(2,"/api/admin/diretorias","POST",dre(11),409)
                check(api(2,f"/api/admin/diretorias/{identity}/status/","PUT",{"ativo":True})["ativo"],"Reativacao de DRE; duplicidade entre inativas retorna 409")
                api(2,"/api/admin/diretorias/1/status","PUT",{"ativo":False},409)
                api(2,"/api/admin/diretorias/3/status","PUT",{"ativo":False},409)
                check(True,"Dependencias de escola ativa e acesso administrativo impedem desativacao de DRE")
                # DRE contendo apenas escola inativa ainda pode ter vinculo ou acesso vigente.
                sql("INSERT INTO diretorias_ensino(id,nome,codigo) VALUES (20,'Fictional Dependency DRE','DEP-20'); INSERT INTO unidades_escolares(id,diretoria_ensino_id,nome,latitude,longitude,ativa) VALUES(20,20,'Fictional Inactive Dependency',0,0,0)")
                sql("INSERT INTO cargos(id,cargo) VALUES(1,'Fictional Cargo'); INSERT INTO funcionarios(id,cpf,nome,email) VALUES(1,'20000000001','Fictional Employee','employee@example.invalid'); INSERT INTO vinculos_funcionais(funcionario_id,unidade_escolar_id,cargo_id,horario_entrada,horario_saida_almoco,horario_volta_almoco,horario_saida,data_inicio,status) VALUES(1,20,1,'08:00','12:00','13:00','17:00',CURRENT_DATE,'ATIVO')")
                api(2,"/api/admin/diretorias/20/status","PUT",{"ativo":False},409)
                sql("UPDATE vinculos_funcionais SET status='ENCERRADO',data_fim=CURRENT_DATE WHERE funcionario_id=1; INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,unidade_escolar_id,status) VALUES(9,'DIRETOR',20,'PENDENTE')")
                api(2,"/api/admin/diretorias/20/status","PUT",{"ativo":False},409)
                check(True,"Vinculo nao encerrado e acesso pendente na escola inativa impedem desativacao")

            def validation():
                for query in ("?page=0","?limit=101","?ativa=maybe","?diretoria_ensino_id=0","?q="+'x'*121,"?page=1&page=2","/0"):
                    check(api(3,"/api/admin/escolas"+query,expected=422)["error"]["code"]=="VALIDATION_ERROR","Validacao escolar 422: "+query[:50])
                for field,value in (("nome","ab"),("nome","<invalid>"),("cep","abc"),("codigo_inep","1"),("raio_permitido_metros",9),("raio_permitido_metros","100"),("diretoria_ensino_id","1")):
                    form=school(30);form[field]=value
                    api(3,"/api/admin/escolas/preview","POST",form,400,problem=True)
                    check(True,"Previa rejeita campo invalido: "+field+"="+str(value))
                api(3,method="POST",data=school(31,cep="13010995"),expected=400,problem=True)
                check(True,"Cadastro sem coordenadas rejeitado sem persistencia")
                for path,method,form in (("/api/admin/diretorias?ativo=1","GET",None),("/api/admin/diretorias?ativo=true&ativo=false","GET",None),("/api/admin/diretorias","POST",{}),("/api/admin/diretorias","POST",dict(dre(30),nome='x'*151)),("/api/admin/diretorias/0","PUT",dre(30)),("/api/admin/diretorias/4294967296","PUT",dre(30)),("/api/admin/diretorias/1/status","PUT",{"ativo":"false"})):
                    api(2,path,method,form,400)
                    check(True,"Validacao DRE 400: "+method+" "+path)
                for path in ("/api/admin/diretorias/9999","/api/admin/diretorias/9999/status"):
                    payload={"ativo":False} if path.endswith("status") else dre(31)
                    check(api(2,path,"PUT",payload,404)["error"]["code"]=="EDUCATION_DEPARTMENT_ERROR","DRE inexistente 404 sem vazar detalhes")
                status,_,_=users[3].request(app+"/api/admin/escolas/preview","POST",b'{',{ "Origin":app,"Content-Type":"application/json"})
                check(status==400,"JSON malformado retorna 400")

            def rbac():
                before=counts()
                for user in (1,2,5,6,7):
                    api(user,"/api/admin/escolas/diretorias",expected=403)
                    api(user,"/api/admin/escolas/cep/13010100",expected=403)
                    api(user,"/api/admin/escolas/preview","POST",school(40),403)
                    api(user,method="POST",data=school(40),expected=403)
                    check(True,f"Perfil {user} nao possui escola.criar")
                for user in (1,3,4,5,6,7):
                    for path,method,form in (("/api/admin/diretorias","GET",None),("/api/admin/diretorias","POST",dre(40)),("/api/admin/diretorias/2","PUT",dre(41)),("/api/admin/diretorias/2/status","PUT",{"ativo":False})):
                        api(user,path,method,form,403)
                    check(True,f"Perfil {user} nao possui diretoria.gerenciar")
                for user in (3,8):
                    api(user,"/api/admin/escolas/preview","POST",school(42,2),403)
                    api(user,method="POST",data=school(42,2),expected=403)
                check(api(8,"/api/admin/escolas/diretorias")["items"][0]["id"]==1,"SEDUC+DRE nao soma capacidade de criar com escopo global")
                check(counts()==before,"Mutacoes sem capacidade ou fora do territorio nao gravam")
                for path in ("/api/admin/escolas","/api/admin/diretorias"):
                    api(Browser(),path,expected=401)
                    api(Browser(),path,"POST",{},401)
                    api(Browser(),path+"?admin_id=2&perfil=ADMIN_SEDUC",expected=401,headers={"Authorization":"Bearer forged","X-Admin-Id":"2"})
                check(True,"Sessao ausente/forjada e identificadores do navegador nao autorizam")

            def csrf():
                before=counts()
                for user,path,method,form in ((3,"/api/admin/escolas","POST",school(50)),(3,"/api/admin/escolas/preview","POST",school(51)),(2,"/api/admin/diretorias","POST",dre(50)),(2,"/api/admin/diretorias/2","PUT",dre(51)),(2,"/api/admin/diretorias/2/status","PUT",{"ativo":False})):
                    for origin in (None,"null","https://evil.invalid",app+".evil",app.replace("127.0.0.1","localhost")):
                        headers={"Content-Type":"application/json"}
                        if origin is not None: headers["Origin"]=origin
                        status,_,raw=users[user].request(app+path,method,json.dumps(form).encode(),headers)
                        check(status==403 and json.loads(raw)["error"]["code"]=="FORBIDDEN",f"CSRF {method} {path}, origem {origin or 'ausente'}")
                status,_,_=users[3].request(app+"/api/admin/escolas/preview","POST",json.dumps(school(52)).encode(),{"Content-Type":"application/json","Referer":app+"/admin/escolas"})
                check(status==200,"Referer da origem configurada aceito sem Origin")
                check(counts()==before,"Tentativas CSRF nao gravam")

            def rollback():
                before=counts(); audit_before=len(audits())
                sql("CREATE TRIGGER isolated_school_rollback AFTER INSERT ON unidades_escolares FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback'")
                try:
                    api(3,method="POST",data=school(60),expected=500,problem=True)
                    check(counts()==before and len(audits())==audit_before,"Rollback escolar preserva contagem e nao audita sucesso")
                finally: sql("DROP TRIGGER isolated_school_rollback")
                sql("CREATE TRIGGER isolated_dre_rollback AFTER INSERT ON diretorias_ensino FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback'")
                try:
                    api(2,"/api/admin/diretorias","POST",dre(60),502)
                    check(counts()==before and len(audits())==audit_before,"Rollback cadastro DRE sem registro parcial ou auditoria de sucesso")
                finally: sql("DROP TRIGGER isolated_dre_rollback")
                old=sql("SELECT nome,ativo FROM diretorias_ensino WHERE id=4")
                sql("CREATE TRIGGER isolated_dre_update AFTER UPDATE ON diretorias_ensino FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback'")
                try:
                    api(2,"/api/admin/diretorias/4","PUT",dre(61),502)
                    api(2,"/api/admin/diretorias/4/status","PUT",{"ativo":True},502)
                    check(sql("SELECT nome,ativo FROM diretorias_ensino WHERE id=4")==old and len(audits())==audit_before,"Rollback edicao/status DRE preserva dados e auditoria")
                finally: sql("DROP TRIGGER isolated_dre_update")

            def audits():
                return [l for l in (folder/"spring.log").read_text().splitlines() if "audit_evento" in l]

            def lock_row(table, row):
                client=subprocess.Popen(["docker","exec","-i",name,"mysql","--unbuffered","-uroot","-N","school_check"],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                clients.append(client)
                client.stdin.write(f"START TRANSACTION; SELECT id FROM {table} WHERE id={row} FOR UPDATE; SELECT 'LOCK_READY';\n");client.stdin.flush()
                assert client.stdout.readline().strip()==str(row) and client.stdout.readline().strip()=="LOCK_READY"
                return client

            def release(client,statement=""):
                client.stdin.write((statement+";" if statement else "")+"COMMIT;\n");client.stdin.close()
                assert client.wait(timeout=10)==0

            def race_school():
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                    entered,go=threading.Event(),threading.Event();Provider.gates["13010108"]=(entered,go)
                    before=counts();audit_before=len(audits())
                    pending=pool.submit(api,3,"/api/admin/escolas","POST",school(70,cep="13010108"),403)
                    assert entered.wait(6),"CEP nao recebeu requisicao"
                    sql("UPDATE acessos_administrativos SET status='REVOGADO' WHERE usuario_administrativo_id=3")
                    go.set()
                    try:
                        pending.result(12)
                        check(counts()==before and len(audits())==audit_before,"Revogacao durante CEP impede criacao e auditoria de sucesso")
                    finally:
                        sql("UPDATE acessos_administrativos SET status='ATIVO' WHERE usuario_administrativo_id=3");users[3]=login(3)
                        Provider.gates.pop("13010108",None)
                    lock=lock_row("diretorias_ensino",1)
                    pending=pool.submit(api,3,"/api/admin/escolas","POST",school(71),400,True)
                    wait_until(lambda:int(sql("SELECT COUNT(*) FROM performance_schema.data_lock_waits"))>0,timeout=6)
                    release(lock,"UPDATE diretorias_ensino SET ativo=0 WHERE id=1")
                    try:
                        pending.result(12)
                        check(counts()==before,"DRE desativada enquanto cadastro aguarda lock impede INSERT")
                    finally: sql("UPDATE diretorias_ensino SET ativo=1 WHERE id=1")

            def race_parallel():
                # Duas criacoes simultaneas devem terminar com 201+409, sem exaurir pool.
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                    entered,go=threading.Event(),threading.Event();Provider.gates["13010109"]=(entered,go)
                    initial=Provider.cep_calls
                    def create():
                        return users[3].request(app+"/api/admin/escolas","POST",json.dumps(school(72,cep="13010109")).encode(),{"Origin":app,"Content-Type":"application/json"})[0]
                    futures=[pool.submit(create) for _ in range(2)]
                    wait_until(lambda:Provider.cep_calls>=initial+2,timeout=6)
                    go.set()
                    try:
                        statuses=sorted(f.result(12) for f in futures)
                        check(statuses==[201,409],"Cadastros simultaneos de mesma escola: 201+409, sem esgotar pool; recebido "+str(statuses))
                        check(sql("SELECT COUNT(*) FROM unidades_escolares WHERE codigo_inep='20000072'")=="1","Concorrencia cria somente uma escola")
                    finally: Provider.gates.pop("13010109",None)

            def race_dre():
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    for suffix,payload in (("",dre(73)),("/status",{"ativo":True})):
                        lock=lock_row("diretorias_ensino",4);old=sql("SELECT nome,ativo FROM diretorias_ensino WHERE id=4");audit_before=len(audits())
                        pending=pool.submit(api,2,"/api/admin/diretorias/4"+suffix,"PUT",payload,403)
                        wait_until(lambda:int(sql("SELECT COUNT(*) FROM performance_schema.data_lock_waits"))>0,timeout=6)
                        # Acesso SEDUC revogado antes de obter o lock do recurso.
                        sql("UPDATE acessos_administrativos SET status='REVOGADO' WHERE usuario_administrativo_id=2")
                        release(lock)
                        try:
                            pending.result(12)
                            check(sql("SELECT nome,ativo FROM diretorias_ensino WHERE id=4")==old and len(audits())==audit_before,"Revogacao durante lock de DRE impede "+("status" if suffix else "edicao")+" e auditoria")
                        finally:
                            sql("UPDATE acessos_administrativos SET status='ATIVO' WHERE usuario_administrativo_id=2");users[2]=login(2)
                    sql("INSERT INTO diretorias_ensino(id,nome,codigo) VALUES(30,'Fictional Concurrent DRE','RACE-30')")
                    lock=lock_row("diretorias_ensino",30)
                    pending=pool.submit(api,2,"/api/admin/diretorias/30/status","PUT",{"ativo":False},409)
                    wait_until(lambda:int(sql("SELECT COUNT(*) FROM performance_schema.data_lock_waits"))>0,timeout=6)
                    release(lock,"INSERT INTO unidades_escolares(diretoria_ensino_id,nome,latitude,longitude) VALUES(30,'Fictional Concurrent Dependency',0,0)")
                    pending.result(12)
                    check(sql("SELECT ativo FROM diretorias_ensino WHERE id=30")=="1","Dependencia criada durante espera do lock impede desativacao da DRE")
                    sql("INSERT INTO diretorias_ensino(id,nome,codigo) VALUES(31,'Fictional Deleted DRE','RACE-31')")
                    lock=lock_row("diretorias_ensino",31)
                    pending=pool.submit(api,2,"/api/admin/diretorias/31","PUT",dre(74),404)
                    wait_until(lambda:int(sql("SELECT COUNT(*) FROM performance_schema.data_lock_waits"))>0,timeout=6)
                    release(lock,"DELETE FROM diretorias_ensino WHERE id=31")
                    pending.result(12)
                    check(sql("SELECT COUNT(*) FROM diretorias_ensino WHERE id=31")=="0","DRE removida antes do lock retorna 404 e nao e recriada")

            def sessions():
                for account in (9,10,11,12,14,15):
                    browser,callback,_=begin(account)
                    check(browser.request(callback)[0]==403 and browser.request(app+"/api/admin/escolas")[0]==401,f"Login fail-closed: admin sem acesso/inativo/vigencia/escopo/perfil invalido {account}")
                browser,callback,_=begin(1)
                parsed=urllib.parse.urlsplit(callback);q=urllib.parse.parse_qs(parsed.query);q["state"]=["forged"]
                check(browser.request(urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(q,doseq=True))))[0]==401,"OAuth state incorreto rejeitado")
                check(browser.request(callback)[0]==400,"OAuth state consumido nao pode ser reutilizado")
                for statement,restore in (("UPDATE usuarios_administrativos SET ativo=0 WHERE id=5","UPDATE usuarios_administrativos SET ativo=1 WHERE id=5"),("UPDATE acessos_administrativos SET data_inicio=CURRENT_DATE-INTERVAL 2 DAY,data_fim=CURRENT_DATE-INTERVAL 1 DAY WHERE usuario_administrativo_id=5","UPDATE acessos_administrativos SET data_inicio=CURRENT_DATE,data_fim=NULL WHERE usuario_administrativo_id=5"),("UPDATE acessos_administrativos SET status='REVOGADO' WHERE usuario_administrativo_id=5","UPDATE acessos_administrativos SET status='ATIVO' WHERE usuario_administrativo_id=5")):
                    users[5]=login(5);sql(statement)
                    try:
                        api(5,expected=401);check(True,"Sessao invalidada na proxima requisicao: "+statement.split(" SET ")[1].split(" WHERE")[0])
                    finally: sql(restore)
                browser=login(1)
                check(browser.request(app+"/auth/govbr/logout","POST",headers={"Origin":app})[0]==302,"Logout de origem valida")
                api(browser,expected=401)
                check(True,"Cookie de sessao apos logout nao concede acesso")

            def internal():
                target="/internal/escolas/listagem";payload=json.dumps({"escopo_global":False,"unidades_escolares_ids":[1],"page":1,"limit":20}).encode()
                check(users[2].request(app+target,"POST",payload,{"Content-Type":"application/json"})[0]==401,"Cookie publico nao substitui HMAC interno")
                def signed(method,path,body=b"",timestamp=None):
                    timestamp=str(timestamp or int(time.time()));rid=str(uuid.uuid4())
                    canonical="\n".join((method,path,timestamp,rid,hashlib.sha256(body).hexdigest()))
                    return {"Content-Type":"application/json","X-Internal-Timestamp":timestamp,"X-Internal-Request-Id":rid,"X-Internal-Signature":hmac.new(key.encode(),canonical.encode(),hashlib.sha256).hexdigest()}
                headers=signed("POST",target,payload)
                status,_,raw=Browser().request(app+target,"POST",payload,headers)
                check(status==200 and "items" in json.loads(raw) and "success" not in json.loads(raw),"HMAC valido preserva contrato interno de listagem")
                check(Browser().request(app+target,"POST",payload,headers)[0]==401,"Replay HMAC rejeitado")
                headers=signed("POST",target,payload);headers["X-Internal-Signature"]="0"*64
                check(Browser().request(app+target,"POST",payload,headers)[0]==401,"Assinatura adulterada rejeitada")
                check(Browser().request(app+target,"POST",payload,signed("POST",target,payload,int(time.time())-120))[0]==401,"Timestamp HMAC expirado rejeitado")
                query="/internal/diretorias?ativo=true"
                status,_,raw=Browser().request(app+query,headers=signed("GET",query))
                check(status==200 and isinstance(json.loads(raw),list),"GET interno de DRE assinado inclui query no HMAC")
                for method,path,data,expected in (("POST","/internal/escolas/preview",school(80),200),("POST","/internal/escolas",school(81),201),("POST","/internal/diretorias",dre(80),201)):
                    body=json.dumps(data).encode();status,_,raw=Browser().request(app+path,method,body,signed(method,path,body))
                    check(status==expected and "success" not in json.loads(raw),"Contrato HMAC preservado: "+method+" "+path)
                    if path == "/internal/diretorias":
                        identity=json.loads(raw)["id"]
                for suffix,data in (("",dre(81)),("/status",{"ativo":False})):
                    path=f"/internal/diretorias/{identity}"+suffix;body=json.dumps(data).encode()
                    status,_,raw=Browser().request(app+path,"PUT",body,signed("PUT",path,body))
                    check(status==200 and "success" not in json.loads(raw),"Contrato HMAC de edicao/status DRE preservado: "+path)
                for path in ("/internal;probe/escolas/listagem","/%69nternal/escolas/listagem"):
                    check(Browser().request(app+path,"POST",payload,{"Content-Type":"application/json"})[0]==401,"Caminho alternativo interno exige HMAC: "+path)

            def expiry():
                spring.terminate();spring.wait(timeout=15)
                process=start(("--admin.session.ttl-seconds=1",))
                browser=login(1)
                time.sleep(1.1)
                api(browser,expected=401)
                check(True,"TTL absoluto expirado invalida sessao Spring")
                assert process.poll() is None

            for group, action in (("read",read),("preview-cep",preview_cep),("create",create_school),("departments",departments),("validation",validation),("rbac",rbac),("csrf",csrf),("rollback",rollback),("race-school",race_school),("race-parallel",race_parallel),("race-dre",race_dre),("sessions",sessions),("hmac",internal),("expiry",expiry)):
                scenario(group,action)
            current="infra"
            logs=(folder/"spring.log").read_text()
            check(all(secret not in logs for secret in secrets_used),"Logs nao expoem chaves ou credenciais temporarias")
        except Exception as failure:
            results.append(("BLOQUEADO",current,type(failure).__name__+": "+str(failure)[:500]))
            print("BLOQUEADO "+current+": "+type(failure).__name__+": "+str(failure)[:500],flush=True)
            if (folder/"spring.log").exists():
                safe="\n".join(l for l in (folder/"spring.log").read_text().splitlines() if "ERROR" in l or "Caused by:" in l)[-2500:]
                for secret in secrets_used: safe=safe.replace(secret,"[redacted]")
                if safe: print(safe,flush=True)
        finally:
            for gate in Provider.gates.values(): gate[1].set()
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
            if created: run("docker","rm","-f",name)
            current="cleanup"
            check(run(*SNAPSHOT)==baseline,"mysql-dev e node-dev: mesmos IDs, estados, datas de inicio e reinicios")
            check(all(p.exists() and hashlib.sha256(p.read_bytes()).digest()==digest for p,digest in protected.items()),".env preservados byte a byte")
            check(name not in run("docker","ps","-a","--format","{{.Names}}"),"Container MySQL temporario removido; processos Java/Python e clientes temporarios encerrados")
            report=["", "## Rodada UTC "+datetime.datetime.now(datetime.timezone.utc).isoformat(), "", "Grupos: "+(args.only or "todos")+".", "", "| Resultado | Grupo | Cenario |", "|---|---|---|"]
            report.extend(f"| {status} | {group} | {description.replace('|','/').replace(chr(10),' ')} |" for status,group,description in results)
            report.extend(["", "Totais desta rodada: "+"; ".join(f"{s}={sum(r==s for r,_,_ in results)}" for s in ("PASSOU","FALHOU","BLOQUEADO"))+".",""])
            if not REPORT.exists():
                REPORT.write_text("# Homologacao Spring — escolas e diretorias\n\nJava 21, MySQL 8.4 temporario em tmpfs e mocks Python locais de Gov.br/CEP.\nHTTP direto no Spring, sem Express, dados exclusivamente ficticios. Nao le .env.\n\nReproduzir: `./mvnw -o -DskipTests package && python3 scripts/check-public-schools.py`.\nReexecucao seletiva: `python3 scripts/check-public-schools.py --only race-school,race-parallel,race-dre`.\nRequer Docker e imagem mysql:8.4 local. Sem commit, merge ou deploy.\n")
            with REPORT.open("a") as output: output.write("\n".join(report))
    if any(r!="PASSOU" for r,_,_ in results): raise SystemExit(1)
    print(f"PASSOU {len(results)} verificacoes; {REPORT.relative_to(ROOT)}",flush=True)


if __name__=="__main__":
    main()
