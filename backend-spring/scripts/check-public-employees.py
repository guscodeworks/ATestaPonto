#!/usr/bin/env python3
"""Homologacao HTTP direta: Spring real, Gov.br simulado e MySQL descartavel.

Executar apos ./mvnw -DskipTests package. Nao le configuracoes .env, nao usa
gateway Node e nunca inicia/altera mysql-dev ou node-dev. Docker e Java 21
sao necessarios. O relatorio nao inclui cookies, tokens ou credenciais.
"""
import concurrent.futures
import datetime
import email
import email.policy
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import uuid

SUPPORT_PATH = Path(__file__).with_name("check-admin-auth.py")
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("admin_auth_check", SUPPORT_PATH)
SUPPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUPPORT)
Browser, run, free_port, wait_until = SUPPORT.Browser, SUPPORT.run, SUPPORT.free_port, SUPPORT.wait_until
ROOT, JAR = SUPPORT.ROOT, SUPPORT.JAR
REPORT = ROOT / "backend-spring/HOMOLOGACAO-FUNCIONARIOS.md"
SNAPSHOT = ["docker", "inspect", "--format",
            "{{.Name}} {{.Id}} {{.State.Status}} {{.State.StartedAt}} {{.RestartCount}}",
            "mysql-dev", "node-dev"]


def cpf(number):
    text = f"{number:09d}"
    for factor in (10, 11):
        digit = sum(int(char) * (factor - index) for index, char in enumerate(text)) * 10 % 11
        text += str(0 if digit == 10 else digit)
    return text


class Mailbox(socketserver.StreamRequestHandler):
    messages = []

    def handle(self):
        def reply(text):
            self.wfile.write((text + "\r\n").encode())
            self.wfile.flush()

        reply("220 localhost isolated SMTP")
        while line := self.rfile.readline():
            command = line.decode(errors="replace").strip().upper()
            if command.startswith("EHLO"):
                reply("250-localhost\r\n250 AUTH PLAIN")
            elif command.startswith("AUTH PLAIN"):
                reply("235 authenticated")
            elif command == "DATA":
                reply("354 data")
                content = bytearray()
                while (part := self.rfile.readline()) not in (b".\r\n", b"", b".\n"):
                    content.extend(part[1:] if part.startswith(b"..") else part)
                self.messages.append(email.message_from_bytes(bytes(content), policy=email.policy.default))
                reply("250 accepted")
            elif command == "QUIT":
                reply("221 goodbye")
                return
            else:
                reply("250 OK")


def main():
    results = []
    processes, held_clients = [], []
    temporary_name = "atesta-employee-check-" + uuid.uuid4().hex[:12]
    created = False
    protected = {path: hashlib.sha256(path.read_bytes()).digest()
                 for path in ROOT.rglob(".env") if "node_modules" not in path.parts}
    baseline = run(*SNAPSHOT)
    assert JAR.is_file() and SUPPORT.java21(), "Package Spring with Java 21 first"
    sensitive = []

    def check(condition, name):
        status = "PASSOU" if condition else "FALHOU"
        results.append((status, name))
        print(status + " " + name, flush=True)
        if not condition:
            raise AssertionError(name)

    with tempfile.TemporaryDirectory(prefix="atesta-employees-") as temporary:
        folder = Path(temporary)
        smtp = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Mailbox)
        smtp.daemon_threads = True
        threading.Thread(target=smtp.serve_forever, daemon=True).start()
        try:
            run("docker", "run", "--rm", "-d", "--name", temporary_name,
                "--label", "atestaponto.purpose=public-employee-homologation", "--memory", "512m",
                "--tmpfs", "/var/lib/mysql:rw,size=512m", "-p", "127.0.0.1::3306",
                "-e", "MYSQL_ALLOW_EMPTY_PASSWORD=yes", "-e", "MYSQL_DATABASE=employee_check",
                "mysql:8.4", "--innodb-buffer-pool-size=64M")
            created = True
            db_port = run("docker", "port", temporary_name, "3306/tcp").rsplit(":", 1)[1]

            def sql(statement):
                return run("docker", "exec", "-i", temporary_name, "mysql", "-uroot", "-N",
                           "employee_check", input=statement)

            wait_until(lambda: sql("SELECT 1") == "1")
            sql((ROOT / "atesta-gateway/database/schema/ponto.sql").read_text())
            sql("""
                INSERT INTO diretorias_ensino(id,nome,codigo) VALUES (1,'Fictional DRE A','TEST-A'),(2,'Fictional DRE B','TEST-B');
                INSERT INTO unidades_escolares(id,diretoria_ensino_id,nome,latitude,longitude) VALUES
                  (1,1,'Fictional School A',0,0),(2,2,'Fictional School B',0,0),(3,1,'Fictional School C',0,0);
                INSERT INTO usuarios_administrativos(id,cpf,nome,ativo) VALUES
                  (1,'10000000001','Fictional Director',1),(2,'10000000002','Fictional SEDUC',1),
                  (3,'10000000003','Fictional DRE A',1),(4,'10000000004','Fictional DRE B',1),
                  (5,'10000000005','Fictional Vice',1),(6,'10000000006','Fictional Secretary',1),
                  (7,'10000000007','Fictional Coordinator',1);
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,unidade_escolar_id,status) VALUES
                  (1,'DIRETOR',1,'ATIVO'),(5,'VICE_DIRETOR',1,'ATIVO'),(6,'SECRETARIA',1,'ATIVO'),(7,'COORDENADOR',1,'ATIVO');
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,diretoria_ensino_id,status) VALUES
                  (3,'ADMIN_DIRETORIA',1,'ATIVO'),(4,'ADMIN_DIRETORIA',2,'ATIVO');
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,status) VALUES (2,'ADMIN_SEDUC','ATIVO');
                INSERT INTO cargos(id,cargo) VALUES (1,'PROFESSOR');
            """)
            for number, unit in ((1, 1), (2, 2), (3, 3), (4, 1)):
                sql(f"""INSERT INTO funcionarios(id,cpf,nome,email,ativo)
                    VALUES ({number},'{cpf(number)}','Fictional Employee {number}','employee{number}@example.invalid',1);
                    INSERT INTO vinculos_funcionais(funcionario_id,unidade_escolar_id,cargo_id,
                      horario_entrada,horario_saida_almoco,horario_volta_almoco,horario_saida,data_inicio,status)
                    VALUES ({number},{unit},1,'08:00','12:00','13:00','17:00',CURRENT_DATE,'ATIVO');""")

            app = f"http://127.0.0.1:{free_port()}"
            provider = f"http://127.0.0.1:{free_port()}"
            key, password, client_secret = (secrets.token_hex(32) for _ in range(3))
            sensitive.extend((key, password, client_secret))
            base = {name: os.environ[name] for name in ("PATH", "JAVA_HOME", "SystemRoot", "WINDIR") if name in os.environ}
            provider_env = dict(base, NODE_ENV="development", REDIS_ENABLED="false", HOST="127.0.0.1",
                GOVBR_FAKE_PORT=provider.rsplit(":", 1)[1], GOVBR_FAKE_ADMIN_LOGIN="adminlocal",
                GOVBR_FAKE_ADMIN_PASSWORD=password, GOVBR_FAKE_ADMIN_SUB="10000000001",
                GOVBR_FAKE_CLIENT_ID="employee-check", GOVBR_FAKE_CLIENT_SECRET=client_secret,
                PONTO_ESCOLAR_REDIRECT_URI=app + "/auth/govbr/callback", PONTO_ESCOLAR_START_URL=app + "/auth/govbr/login")
            for number, account in enumerate(("SEDUC", "DRE1", "DRE2", "VICE_DIRETOR", "SECRETARIA", "COORDENADOR"), 2):
                for field, value in dict(LOGIN=f"user{number}", PASSWORD=password, SUB=f"1000000000{number}",
                                         NAME=f"Fictional {number}", EMAIL=f"fictional{number}@example.invalid").items():
                    provider_env[f"GOVBR_FAKE_ADMIN_{account}_{field}"] = value
            app_env = dict(base, DB_HOST="127.0.0.1", DB_PORT=db_port, DB_NAME="employee_check", DB_USER="root",
                DB_PASSWORD="", INTERNAL_API_SHARED_KEY=key, REDIS_ENABLED="false", ADMIN_SESSION_SECURE="false",
                ADMIN_SESSION_TTL_SECONDS="900", GOVBR_AUTHORIZE_URL=provider + "/fake-govbr/authorize",
                GOVBR_TOKEN_URL=provider + "/fake-govbr/token", GOVBR_USERINFO_URL=provider + "/fake-govbr/userinfo",
                GOVBR_CLIENT_ID="employee-check", GOVBR_CLIENT_SECRET=client_secret,
                GOVBR_REDIRECT_URI=app + "/auth/govbr/callback", GOVBR_LOGOUT_URL="/", BCRYPT_SALT_ROUNDS="4",
                MAIL_ENABLED="true", SMTP_HOST="127.0.0.1", SMTP_PORT=str(smtp.server_address[1]),
                SMTP_USER="fictional", SMTP_PASS=secrets.token_hex(16), SMTP_SECURE="false",
                MAIL_FROM="Fictional <sender@example.invalid>", APP_BASE_URL=app)
            sensitive.append(app_env["SMTP_PASS"])
            for name, command, environment in (
                    ("provider", ["node", str(ROOT / "atesta-id/server.js")], provider_env),
                    ("spring", ["java", "-jar", str(JAR), "--server.address=127.0.0.1", "--server.port=" + app.rsplit(":", 1)[1]], app_env)):
                with (folder / (name + ".log")).open("w") as log:
                    processes.append(subprocess.Popen(command, cwd=folder, env=environment, stdout=log, stderr=log))
            wait_until(lambda: Browser().request(provider + "/health")[0] == 200)
            wait_until(lambda: Browser().request(app + "/auth/govbr/start")[0] == 302)
            api_root = "/api/admin/funcionarios"

            def audit_lines():
                return [line for line in (folder / "spring.log").read_text().splitlines() if "audit_evento" in line]

            def api(browser, suffix="", method="GET", data=None, expected=200, headers=None):
                options = {"Content-Type": "application/json", "Origin": app, **(headers or {})}
                status, response_headers, raw = browser.request(app + api_root + suffix, method,
                    None if data is None else json.dumps(data).encode(), options)
                if status != expected:
                    raise AssertionError(f"{method} {suffix or '/'}: esperado {expected}, recebido {status}; {raw[:700]}")
                payload = json.loads(raw)
                assert "application/json" in response_headers.get("Content-Type", "")
                assert payload.get("success") is (expected < 400), raw[:400]
                if expected >= 400:
                    assert isinstance(payload.get("error", {}).get("code"), str), raw[:400]
                else:
                    assert "data" in payload
                return payload.get("data", payload)

            def login(account="adminlocal"):
                browser, fake = Browser(), Browser()
                _, headers, _ = browser.request(app + "/auth/govbr/login")
                before = browser.sid()
                assert before
                authorize = headers["Location"]
                query = urllib.parse.parse_qs(urllib.parse.urlsplit(authorize).query)
                assert query["code_challenge_method"] == ["S256"]
                data = urllib.parse.urlencode(dict(login=account, password=password)).encode()
                assert fake.request(provider + "/fake-govbr/login", "POST", data,
                    {"Content-Type": "application/x-www-form-urlencoded"})[0] == 200
                _, callback_headers, _ = fake.request(authorize)
                status, headers, _ = browser.request(callback_headers["Location"])
                assert status == 302 and headers["Location"].endswith("/admin/dashboard"), status
                assert browser.sid() and before != browser.sid()
                return browser

            users = [login()] + [login(f"user{number}") for number in range(2, 8)]
            director, seduc, dre_a, dre_b, vice, secretary, coordinator = users
            check(True, "Sessao legitima via Authorization Code/PKCE no simulador; cookies renovados para os sete perfis")
            check(api(Browser(), expected=401)["error"]["code"] == "UNAUTHORIZED", "Sem sessao: GET 401 com contrato JSON")
            check(api(Browser(), method="POST", data={}, expected=401)["error"]["code"] == "UNAUTHORIZED", "Sem sessao: POST da mesma origem retorna 401")
            api(Browser(), "?admin_id=1&perfil=ADMIN_SEDUC", expected=401,
                headers={"Authorization": "Bearer forged", "X-Admin-Id": "1"})
            check(True, "IDs, perfil e Bearer fornecidos pelo navegador nao criam sessao")

            check({x["id"] for x in api(director)["items"]} == {1, 4}, "Listagem escolar restrita aos vinculos atuais da escola A")
            check({x["id"] for x in api(dre_a)["items"]} == {1, 3, 4}, "DRE A inclui escolas A/C e exclui a DRE B")
            check({x["id"] for x in api(dre_b)["items"]} == {2}, "DRE B inclui somente escola B")
            for suffix in ("", "/1", "/unidades"):
                api(seduc, suffix, expected=403)
            check(True, "SEDUC autentica mas nao recebe capacidades de funcionarios nem escopo global implicito")
            injected = api(director, "?escopo_global=true&unidades_escolares_ids=2&admin_id=2")
            check({x["id"] for x in injected["items"]} == {1, 4}, "Escopo de listagem injetado pelo navegador ignorado")
            page = api(director, "?page=2&limit=1&ativo=true&cargo=professor&q=Fictional")
            check(page["pagination"] == dict(page=2, limit=1, total=2) and len(page["items"]) == 1,
                  "Paginacao, total e filtros ativo/cargo/q preservados")
            check(all(re.fullmatch(r"\*\*\*\.\*\*\*\.\*\*\*-\d{2}", x["cpf"]) for x in injected["items"]), "CPF mascarado na listagem")
            check(set(injected["items"][0]) == {"id", "nome", "cpf", "email", "telefone", "ativo", "desativado_em", "criado_em",
                "cargo_id", "cargo", "entrada", "saida_almoco", "retorno_almoco", "saida"}, "Listagem preserva exatamente os campos publicos")
            detail = api(director, "/1")["funcionario"]
            check(detail["cpf"] == "000.000.001-91" and detail["entrada"] == "08:00:00", "Consulta: CPF formatado, horarios e envelope preservados")
            for browser, suffix in ((director, "/2"), (director, "/3"), (dre_a, "/2"), (dre_b, "/1")):
                api(browser, suffix, expected=403)
            check(True, "Consulta nega funcionario de outra escola/DRE")
            check([x["id"] for x in api(director, "/unidades")["items"]] == [1], "Unidades para cadastro calculadas no servidor")
            for browser in (coordinator, dre_a, seduc):
                api(browser, "/unidades", expected=403)
            check(True, "Unidades para cadastro exigem capacidade de criar")
            check(api(coordinator, "/1")["funcionario"]["id"] == 1
                  and api(vice, "/1")["funcionario"]["id"] == 1, "Coordenacao e vice consultam funcionario da propria escola")

            def form(number, unit=1):
                return dict(nome=f"Fictional Created {number}", cpf=cpf(number), email=f"created{number}@example.invalid",
                            telefone="(11) 99999-0000", ativo=True, unidade_escolar_id=unit, cargo="professor",
                            entrada="08:00", saida_almoco="12:00", retorno_almoco="13:00", saida="17:00")

            for browser in (coordinator, dre_a, seduc):
                api(browser, method="POST", data=form(10), expected=403)
            api(secretary, "/1/desativar", "PATCH", {"confirmacao": "DESATIVAR"}, expected=403)
            api(coordinator, "/1", "PATCH", {"nome": "Fictional denied"}, expected=403)
            check(True, "RBAC: coordenacao nao escreve; DRE/SEDUC nao cadastram; secretaria nao desativa")
            api(director, method="POST", data=form(10, 2), expected=403)
            api(director, "/2", "PATCH", {"nome": "Fictional denied"}, expected=403)
            api(director, "/2/desativar", "PATCH", {"confirmacao": "DESATIVAR"}, expected=403)
            check(True, "Territorio indevido negado no cadastro, edicao e desativacao")
            payload = form(10)
            payload.update(admin_id=2, diretoria_ensino_id=2, vinculo_id=2, senha_hash="forged-client-hash", escopo_global=True)
            mail_before = len(Mailbox.messages)
            created_employee = api(secretary, method="POST", data=payload, expected=201)
            employee_id = created_employee["funcionario"]["id"]
            check(created_employee["funcionario"]["cpf"].startswith("***.") and created_employee["email_acesso"] == {"enviado": True},
                  "Cadastro 201: CPF mascarado, primeiro acesso e e-mail local entregue")
            check(sql(f"SELECT COUNT(*) FROM login_funcionario WHERE funcionario_id={employee_id} AND primeiro_acesso=1") == "1"
                  and sql(f"SELECT unidade_escolar_id FROM vinculos_funcionais WHERE funcionario_id={employee_id}") == "1",
                  "Cadastro persiste funcionario/login/vinculo atomicos e ignora IDs de autorizacao do cliente")
            check(len(Mailbox.messages) == mail_before + 1, "Um e-mail SMTP local apos cadastro confirmado")
            message = Mailbox.messages[-1].get_content()
            generated = re.search(r"Senha temporária: ([^\s]+)", message).group(1)
            password_hash = sql(f"SELECT senha_hash FROM login_funcionario WHERE funcionario_id={employee_id}")
            sensitive.extend((generated, password_hash))
            helper = folder / "CheckHash.java"
            helper.write_text('import java.io.*; import org.springframework.security.crypto.bcrypt.BCrypt; '
                'class CheckHash { public static void main(String[] x) throws Exception { var r=new BufferedReader(new InputStreamReader(System.in)); '
                'if(!BCrypt.checkpw(r.readLine(),r.readLine())) throw new AssertionError(); System.out.print("MATCH"); }}')
            crypto = next((Path.home()/".m2/repository/org/springframework/security/spring-security-crypto").rglob("*.jar"))
            check(run("java", "-cp", str(crypto), str(helper), input=generated + "\n" + password_hash + "\n") == "MATCH",
                  "Senha temporaria enviada corresponde ao BCrypt do banco; hash do navegador ignorado")
            check("senha" not in json.dumps(created_employee).lower() and generated not in json.dumps(created_employee), "Resposta de cadastro nao expoe senha/hash")
            api(director, method="POST", data=form(10), expected=409)
            check(True, "CPF/email duplicados retornam 409")

            edited = api(secretary, f"/{employee_id}", "PATCH", {"nome": "Fictional Edited", "cargo": "inspetor", "entrada": "07:30"})
            check(edited["funcionario"]["nome"] == "Fictional Edited" and edited["funcionario"]["cargo"] == "INSPETOR"
                  and edited["funcionario"]["entrada"] == "07:30:00" and "cargo_id" not in edited["funcionario"], "Edicao 200 e projecao publica preservadas")
            api(secretary, f"/{employee_id}", "PATCH", {"nome": "Fictional denied", "vinculo_id": 2}, expected=422)
            api(director, f"/{employee_id}/desativar", "PATCH", {"confirmacao": "DESATIVAR", "unidade_escolar_id": 2}, expected=422)
            check(True, "Edicao/ativacao rejeitam contexto de autorizacao no payload")
            inactive = api(director, f"/{employee_id}/desativar", "PATCH", {"confirmacao": "DESATIVAR"})
            check(inactive["ativo"] is False and re.fullmatch(r"\d{4}-\d{2}-\d{2}T.*Z", inactive["desativado_em"]), "Desativacao 200 e timestamp ISO")
            check(sql(f"SELECT COUNT(*) FROM vinculos_funcionais WHERE funcionario_id={employee_id} AND status='ATIVO'") == "0", "Desativacao encerra vinculo ativo")
            check(api(director, f"/{employee_id}")["funcionario"]["id"] == employee_id, "Consulta de inativo usa vinculo visivel historico")
            api(director, f"/{employee_id}/desativar", "PATCH", {"confirmacao": "DESATIVAR"}, expected=403)
            api(secretary, f"/{employee_id}/reativar", "PATCH", {"confirmacao": "REATIVAR"}, expected=403)
            active = api(vice, f"/{employee_id}/reativar", "PATCH", {"confirmacao": "REATIVAR"})
            check(active == dict(id=employee_id, ativo=True, desativado_em=None), "Reativacao por vice-diretor: contrato 200")
            check(sql(f"SELECT COUNT(*) FROM vinculos_funcionais WHERE funcionario_id={employee_id}") == "2"
                  and sql(f"SELECT COUNT(*) FROM vinculos_funcionais WHERE funcionario_id={employee_id} AND status='ATIVO'") == "1", "Reativacao cria novo vinculo e preserva historico")
            api(director, f"/{employee_id}/reativar", "PATCH", {"confirmacao": "REATIVAR"}, expected=409)
            check(True, "Reativacao de ativo retorna 409")
            api(dre_a, "/3", "PATCH", {"nome": "Fictional DRE edited"})
            api(dre_a, "/3/desativar", "PATCH", {"confirmacao": "DESATIVAR"})
            api(dre_a, "/3/reativar", "PATCH", {"confirmacao": "REATIVAR"})
            api(dre_a, "/2/desativar", "PATCH", {"confirmacao": "DESATIVAR"}, expected=403)
            check(True, "DRE edita/desativa/reativa na propria diretoria e nao alcanca outra DRE")

            for suffix in ("?limit=101", "?page=0", "?ativo=maybe", "?cargo=DIRETOR", "/0"):
                api(director, suffix, expected=422)
            api(director, f"/{employee_id}", "PATCH", {"cargo": "DIRETOR"}, expected=422)
            api(director, f"/{employee_id}/desativar", "PATCH", {"confirmacao": "invalid"}, expected=422)
            check(True, "Validacoes HTTP 422 mantem envelope e codigo VALIDATION_ERROR")
            api(director, f"/{employee_id}", "PATCH", {"nome": "Fictional CSRF denied"}, expected=403, headers={"Origin": "https://evil.invalid"})
            status, _, _ = director.request(app + api_root + f"/{employee_id}", "PATCH", b'{"nome":"Fictional denied"}', {"Content-Type": "application/json"})
            check(status == 403, "Mutacoes sem origem e de origem estrangeira negadas")

            # A mesma identidade tem capacidades distintas em unidades diferentes.
            sql("INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,unidade_escolar_id,status) VALUES (7,'SECRETARIA',2,'ATIVO')")
            api(coordinator, "/1", "PATCH", {"nome": "Fictional mixed denied"}, expected=403)
            api(coordinator, "/2", "PATCH", {"nome": "Fictional School B edited"})
            check(True, "Capacidade e territorio pertencem ao mesmo acesso; sem somar privilegios entre unidades")

            def counts():
                return sql("SELECT (SELECT COUNT(*) FROM funcionarios),(SELECT COUNT(*) FROM login_funcionario),(SELECT COUNT(*) FROM vinculos_funcionais),(SELECT COUNT(*) FROM cargos)")

            before, mail_before, audit_before = counts(), len(Mailbox.messages), len(audit_lines())
            sql("CREATE TRIGGER employee_check_fail_create BEFORE INSERT ON vinculos_funcionais FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback probe'")
            try:
                rollback_form = form(11)
                rollback_form["cargo"] = "funcionario"
                api(director, method="POST", data=rollback_form, expected=502)
                check(counts() == before and sql(f"SELECT COUNT(*) FROM funcionarios WHERE cpf='{cpf(11)}'") == "0"
                      and len(Mailbox.messages) == mail_before and len(audit_lines()) == audit_before,
                      "Rollback de cadastro remove funcionario/login/cargo e nao envia e-mail nem audita sucesso")
            finally:
                sql("DROP TRIGGER employee_check_fail_create")
            old_name = sql(f"SELECT nome FROM funcionarios WHERE id={employee_id}")
            before, audit_before = counts(), len(audit_lines())
            sql("CREATE TRIGGER employee_check_fail_edit BEFORE UPDATE ON vinculos_funcionais FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback probe'")
            try:
                api(director, f"/{employee_id}", "PATCH", {"nome": "Fictional rolled back", "cargo": "funcionario"}, expected=500)
                check(sql(f"SELECT nome FROM funcionarios WHERE id={employee_id}") == old_name
                      and counts() == before and len(audit_lines()) == audit_before,
                      "Rollback de edicao desfaz funcionario/cargo e nao audita sucesso")
                api(director, f"/{employee_id}/desativar", "PATCH", {"confirmacao": "DESATIVAR"}, expected=500)
                check(sql(f"SELECT ativo FROM funcionarios WHERE id={employee_id}") == "1" and len(audit_lines()) == audit_before,
                      "Rollback de desativacao preserva ativo/vinculo e nao audita sucesso")
            finally:
                sql("DROP TRIGGER employee_check_fail_edit")
            api(director, f"/{employee_id}/desativar", "PATCH", {"confirmacao": "DESATIVAR"})
            sql("CREATE TRIGGER employee_check_fail_reactivate BEFORE INSERT ON vinculos_funcionais FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback probe'")
            try:
                before, audit_before = counts(), len(audit_lines())
                api(director, f"/{employee_id}/reativar", "PATCH", {"confirmacao": "REATIVAR"}, expected=500)
                check(sql(f"SELECT ativo FROM funcionarios WHERE id={employee_id}") == "0" and counts() == before
                      and len(audit_lines()) == audit_before, "Rollback de reativacao preserva inativo, nao cria vinculo e nao audita sucesso")
            finally:
                sql("DROP TRIGGER employee_check_fail_reactivate")

            def lock_row(table, row_id):
                client = subprocess.Popen(["docker", "exec", "-i", temporary_name, "mysql", "--unbuffered", "-uroot", "-N", "employee_check"],
                                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                held_clients.append(client)
                client.stdin.write(f"START TRANSACTION; SELECT id FROM {table} WHERE id={row_id} FOR UPDATE; SELECT 'LOCK_READY';\n")
                client.stdin.flush()
                assert client.stdout.readline().strip() == str(row_id)
                assert client.stdout.readline().strip() == "LOCK_READY"
                return client

            def release(client, statement):
                client.stdin.write(statement + "; COMMIT;\n")
                client.stdin.close()
                assert client.wait(timeout=15) == 0

            def wait_for_write_lock():
                wait_until(lambda: int(sql("SELECT COUNT(*) FROM performance_schema.data_lock_waits")) > 0, timeout=8)

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                locked = lock_row("funcionarios", 4)
                audit_before = len(audit_lines())
                pending = pool.submit(api, director, "/4", "PATCH", {"nome": "Fictional race denied"}, 409)
                wait_for_write_lock()
                release(locked, """UPDATE vinculos_funcionais SET status='ENCERRADO',data_fim=CURRENT_DATE WHERE funcionario_id=4;
                    INSERT INTO vinculos_funcionais(funcionario_id,unidade_escolar_id,cargo_id,horario_entrada,horario_saida_almoco,
                    horario_volta_almoco,horario_saida,data_inicio,status) VALUES (4,2,1,'08:00','12:00','13:00','17:00',CURRENT_DATE,'ATIVO')""")
                pending.result(timeout=15)
                check(sql("SELECT nome FROM funcionarios WHERE id=4") == "Fictional Employee 4" and len(audit_lines()) == audit_before,
                      "Concorrencia real: troca de vinculo entre autorizacao e lock retorna 409 sem editar/auditar sucesso")
                api(director, "/4", expected=403)
                check(api(dre_b, "/4")["funcionario"]["id"] == 4, "Apos transferencia, acesso acompanha o vinculo atual e nao o historico")

                sql("UPDATE vinculos_funcionais SET unidade_escolar_id=1 WHERE funcionario_id=4 AND status='ATIVO'")
                locked = lock_row("funcionarios", 4)
                audit_before = len(audit_lines())
                pending = pool.submit(api, director, "/4/desativar", "PATCH", {"confirmacao": "DESATIVAR"}, 409)
                wait_for_write_lock()
                release(locked, """UPDATE vinculos_funcionais SET status='ENCERRADO',data_fim=CURRENT_DATE WHERE funcionario_id=4 AND status='ATIVO';
                    INSERT INTO vinculos_funcionais(funcionario_id,unidade_escolar_id,cargo_id,horario_entrada,horario_saida_almoco,
                    horario_volta_almoco,horario_saida,data_inicio,status) VALUES (4,2,1,'08:00','12:00','13:00','17:00',CURRENT_DATE,'ATIVO')""")
                pending.result(timeout=15)
                check(sql("SELECT ativo FROM funcionarios WHERE id=4") == "1" and len(audit_lines()) == audit_before,
                      "Concorrencia real: transferencia durante desativacao retorna 409, sem desativar/auditar sucesso")

                sql("""UPDATE vinculos_funcionais SET status='ENCERRADO',data_fim=CURRENT_DATE WHERE funcionario_id=4;
                    UPDATE funcionarios SET ativo=0,desativado_em=CURRENT_TIMESTAMP WHERE id=4;
                    INSERT INTO vinculos_funcionais(funcionario_id,unidade_escolar_id,cargo_id,horario_entrada,horario_saida_almoco,
                    horario_volta_almoco,horario_saida,data_inicio,data_fim,status) VALUES (4,1,1,'08:00','12:00','13:00','17:00',CURRENT_DATE,CURRENT_DATE,'ENCERRADO')""")
                locked = lock_row("funcionarios", 4)
                audit_before = len(audit_lines())
                pending = pool.submit(api, director, "/4/reativar", "PATCH", {"confirmacao": "REATIVAR"}, 409)
                wait_for_write_lock()
                release(locked, "UPDATE vinculos_funcionais SET unidade_escolar_id=2 WHERE funcionario_id=4 ORDER BY id DESC LIMIT 1")
                pending.result(timeout=15)
                check(sql("SELECT ativo FROM funcionarios WHERE id=4") == "0"
                      and sql("SELECT COUNT(*) FROM vinculos_funcionais WHERE funcionario_id=4 AND status='ATIVO'") == "0"
                      and len(audit_lines()) == audit_before,
                      "Concorrencia real: mudanca do ultimo vinculo durante reativacao retorna 409, sem ativar/auditar sucesso")

                locked = lock_row("unidades_escolares", 1)
                before, mail_before = counts(), len(Mailbox.messages)
                pending = pool.submit(api, director, "", "POST", form(12), 409)
                wait_for_write_lock()
                release(locked, "UPDATE unidades_escolares SET diretoria_ensino_id=2 WHERE id=1")
                pending.result(timeout=15)
                check(counts() == before and len(Mailbox.messages) == mail_before, "Concorrencia real: mudanca de DRE da unidade impede cadastro e preserva rollback")
                sql("UPDATE unidades_escolares SET diretoria_ensino_id=1 WHERE id=1")

            sql("UPDATE acessos_administrativos SET status='REVOGADO' WHERE usuario_administrativo_id=1")
            api(director, expected=401)
            sql("UPDATE acessos_administrativos SET status='ATIVO' WHERE usuario_administrativo_id=1")
            director = login()
            sql("UPDATE usuarios_administrativos SET ativo=0 WHERE id=1")
            api(director, expected=401)
            sql("UPDATE usuarios_administrativos SET ativo=1 WHERE id=1")
            director = login()
            check(True, "Revogacao de acesso e identidade desativada invalidam a sessao na proxima requisicao")
            sql("UPDATE acessos_administrativos SET data_inicio=CURRENT_DATE-INTERVAL 2 DAY,data_fim=CURRENT_DATE-INTERVAL 1 DAY WHERE usuario_administrativo_id=5")
            api(vice, expected=401)
            check(True, "Acesso com vigencia encerrada apos login invalida a sessao")

            target, payload = "/internal/auth/admin/context", b'{"admin_id":1}'
            check(director.request(app + target, "POST", payload, {"Content-Type": "application/json"})[0] == 401,
                  "Cookie administrativo nao substitui HMAC em /internal/**")
            timestamp, request_id = str(int(time.time())), str(uuid.uuid4())
            canonical = "\n".join(("POST", target, timestamp, request_id, hashlib.sha256(payload).hexdigest()))
            signed = {"Content-Type": "application/json", "X-Internal-Timestamp": timestamp,
                "X-Internal-Request-Id": request_id, "X-Internal-Signature": hmac.new(key.encode(), canonical.encode(), hashlib.sha256).hexdigest()}
            check(Browser().request(app + target, "POST", payload, signed)[0] == 200, "Contrato HMAC legitimo preservado")
            check(Browser().request(app + target, "POST", payload, signed)[0] == 401, "Replay HMAC negado")
            signed["X-Internal-Request-Id"] = str(uuid.uuid4())
            check(Browser().request(app + target, "POST", payload, signed)[0] == 401, "Assinatura HMAC adulterada negada")
            for path in ("/internal;probe/auth/admin/context", "/%69nternal/auth/admin/context"):
                check(Browser().request(app + path, "POST", payload, {"Content-Type": "application/json"})[0] == 401,
                      "HMAC obrigatorio tambem no caminho alternativo " + path)

            logs = (folder / "spring.log").read_text()
            audit = [line for line in logs.splitlines() if "audit_evento" in line]
            for event in ("funcionario_cadastrado", "funcionario_alterado", "funcionario_desativado", "funcionario_ativado"):
                check(any(f"evento={event}" in line and "adminId=" in line and "funcionarioId=" in line for line in audit), "Auditoria registra " + event)
            check(sum(f"evento=funcionario_cadastrado adminId=6 funcionarioId={employee_id}" in line for line in audit) == 1,
                  "Cadastro confirmado auditado exatamente uma vez")
            check(all(value not in logs for value in sensitive), "Logs nao expoem chaves, credenciais ou senha/hash gerados")
            check(all(process.poll() is None for process in processes), "Spring e simulador permaneceram ativos durante toda a bateria")
        except Exception as failure:
            message = str(failure)
            for value in sensitive:
                message = message.replace(value, "[redacted]")
            if not results or results[-1][0] != "FALHOU":
                results.append(("FALHOU", message))
                print("FALHOU " + message, flush=True)
            results.append(("BLOQUEADO", "Cenarios posteriores ao primeiro erro aguardam correcao e reexecucao"))
            # Somente erros de startup sanitizados; nunca imprime configuracao/ambiente.
            for path in folder.glob("*.log"):
                lines = [line for line in path.read_text().splitlines() if "ERROR" in line or "Caused by:" in line][-8:]
                safe = "\n".join(lines)
                for value in sensitive:
                    safe = safe.replace(value, "[redacted]")
                if safe:
                    print(path.stem + ": " + safe, flush=True)
        finally:
            for client in held_clients:
                if client.poll() is None:
                    if not client.stdin.closed:
                        client.stdin.write("ROLLBACK;\n")
                        client.stdin.close()
                    client.wait(timeout=15)
            for process in reversed(processes):
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
            smtp.shutdown()
            smtp.server_close()
            if created:
                run("docker", "rm", "-f", temporary_name)
            check(run(*SNAPSHOT) == baseline, "mysql-dev e node-dev preservados com mesmo ID, estado e reinicios")
            check(all(path.exists() and hashlib.sha256(path.read_bytes()).digest() == digest for path, digest in protected.items()), ".env preservados byte a byte")
            check(temporary_name not in run("docker", "ps", "-a", "--format", "{{.Names}}"), "MySQL temporario removido; processos e SMTP temporarios encerrados")
            report = ["# Homologacao da API publica de funcionarios", "", "Execucao UTC: " + datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "Execucao direta no Spring, sem gateway Node.",
                "MySQL 8.4 descartavel em tmpfs, Gov.br simulado e SMTP local; dados exclusivamente ficticios.",
                "Nenhum banco existente, .env ou arquivo reservado ao Guilherme foi alterado.", "", "| Resultado | Cenario |", "|---|---|"]
            report.extend(f"| {status} | {name.replace('|', '/').replace(chr(10), ' ')} |" for status, name in results)
            report.extend(["", "Totais: " + "; ".join(f"{status}={sum(result == status for result, _ in results)}"
                                                       for status in ("PASSOU", "FALHOU", "BLOQUEADO")) + "."])
            report.extend(["", "Reproducao: `cd backend-spring && ./mvnw -DskipTests package && python3 scripts/check-public-employees.py`.",
                "Requer Java 21, Docker, imagem mysql:8.4 e dependencias existentes do simulador.",
                "Nenhum commit, merge ou deploy executado. SMTP externo e Gov.br oficial nao fazem parte desta homologacao.", ""])
            REPORT.write_text("\n".join(report))
    if any(status != "PASSOU" for status, _ in results):
        raise SystemExit(1)
    print(f"PASSOU {len(results)} verificacoes; relatorio: {REPORT.relative_to(ROOT)}", flush=True)


if __name__ == "__main__":
    main()
