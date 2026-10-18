#!/usr/bin/env python3
"""Homologa HTTP direto no Spring/JDBC, MySQL/Redis descartaveis e SMTP/Gov.br locais.

Nao carrega .env nem inicia Express. Requer Java 21, Docker, imagens locais
mysql:8.4/redis:7-alpine e bibliotecas Node ja instaladas (somente interoperabilidade).
--only repete somente grupos afetados. Fixtures, preservacao e limpeza sao obrigatorias.
"""
import argparse
import base64
import concurrent.futures
import datetime as dt
import hashlib
import hmac
import http.cookiejar
import http.server
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
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True

def support(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

S = support('punch_school_support', 'check-public-schools.py')
E = support('punch_employee_support', 'check-public-employees.py')
Browser, run, free_port, wait_until = S.Browser, S.run, S.free_port, S.wait_until
ROOT, JAR, SNAPSHOT = S.ROOT, S.JAR, S.SNAPSHOT
REPORT = ROOT / 'backend-spring/HOMOLOGACAO-PONTO-PUBLICO.md'
GROUPS = ['login', 'jwt', 'primeiro-acesso', 'recuperacao', 'qr', 'ponto', 'geo',
          'idempotencia', 'concorrencia', 'rollback', 'auditoria', 'limites', 'isolamento', 'hmac']

class Blocked(Exception):
    pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', help=','.join(GROUPS))
    args = parser.parse_args()
    selected = set(args.only.split(',')) if args.only else set(GROUPS)
    assert selected <= set(GROUPS), 'Grupo desconhecido'
    assert S.SUPPORT.java21() and JAR.is_file(), 'Empacote com Java 21 primeiro'
    results, processes, created, private = [], [], [], []
    requests = 0
    current = 'infra'
    protected = {p: hashlib.sha256(p.read_bytes()).digest() for p in ROOT.rglob('.env') if 'node_modules' not in p.parts}
    baseline = run(*SNAPSHOT)
    prefix = 'atesta-punch-check-' + uuid.uuid4().hex[:10]
    mysql, redis_name = prefix + '-mysql', prefix + '-redis'
    namespace = prefix.replace('-', ':')
    password, changed, jwt_secret, session_secret, key, provider_secret = [secrets.token_hex(24) for _ in range(6)]
    private.extend((password, changed, jwt_secret, session_secret, key, provider_secret))
    today = dt.datetime.now(ZoneInfo('America/Sao_Paulo')).date()
    month = today.strftime('%Y-%m')
    tomorrow = today + dt.timedelta(days=1)

    def check(ok, description):
        if not ok:
            raise AssertionError(description)
        results.append(('PASSOU', current, description))
        print('PASSOU ' + current + ': ' + description, flush=True)

    def safe(value):
        value = str(value)
        for secret in sorted(private, key=len, reverse=True):
            if secret:
                value = value.replace(secret, '[redacted]')
        value = re.sub(r'\$2[ab]\$\d\d\$[./A-Za-z0-9]{53}', '[bcrypt]', value)
        return value[:2500].replace('\n', ' ')

    def node(data):
        script = """const fs=require('fs');const r=JSON.parse(fs.readFileSync(0,'utf8'));
        const bcrypt=require(process.cwd()+'/atesta-gateway/node_modules/bcrypt');
        const jwt=require(process.cwd()+'/atesta-gateway/node_modules/jsonwebtoken');
        let result;if(r.op==='hash')result=bcrypt.hashSync(r.password,10);
        else if(r.op==='check')result=bcrypt.compareSync(r.password,r.hash);
        else result=jwt.verify(r.token,r.first?Buffer.from(r.key,'hex'):r.key);
        process.stdout.write(JSON.stringify(result));"""
        return json.loads(run('node', '-e', script, cwd=ROOT, input=json.dumps(data)))

    def scenario(group, action):
        nonlocal current
        if group not in selected:
            return
        current = group
        try:
            clear_rates()
            action()
        except Blocked as failure:
            results.append(('BLOQUEADO', group, safe(failure)))
            print('BLOQUEADO ' + group + ': ' + safe(failure), flush=True)
        except Exception as failure:
            results.append(('FALHOU', group, safe(failure)))
            print('FALHOU ' + group + ': ' + safe(failure), flush=True)

    with tempfile.TemporaryDirectory(prefix='atesta-punch-http-') as temporary:
        folder = Path(temporary)
        provider = http.server.ThreadingHTTPServer(('127.0.0.1', 0), S.Provider)
        provider.daemon_threads = True
        smtp = socketserver.ThreadingTCPServer(('127.0.0.1', 0), E.Mailbox)
        smtp.daemon_threads = True
        E.Mailbox.messages = []
        for server in (provider, smtp):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            for name, command, options, port in (
                (mysql, ['mysql:8.4', '--innodb-buffer-pool-size=64M'], ['--memory', '512m', '--tmpfs', '/var/lib/mysql:rw,size=512m', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', '-e', 'MYSQL_DATABASE=punch_check'], '3306'),
                (redis_name, ['redis:7-alpine', 'redis-server', '--save', '', '--appendonly', 'no'], ['--memory', '128m'], '6379')):
                run('docker', 'run', '--rm', '-d', '--name', name, '--label', 'atestaponto.purpose=public-punch-homologation', '-p', '127.0.0.1::' + port, *options, *command)
                created.append(name)
            db_port = run('docker', 'port', mysql, '3306/tcp').rsplit(':', 1)[1]
            redis_port = run('docker', 'port', redis_name, '6379/tcp').rsplit(':', 1)[1]

            def sql(statement):
                return run('docker', 'exec', '-i', mysql, 'mysql', '-uroot', '-N', 'punch_check', input=statement)

            def redis(*command, value=None):
                if value is not None:
                    assert command[0] == 'SET'
                    script = "local args={KEYS[1],ARGV[#ARGV]}; for i=1,#ARGV-1 do table.insert(args,ARGV[i]) end; return redis.call('SET',unpack(args))"
                    return run('docker','exec','-i',redis_name,'redis-cli','--raw','-x','EVAL',script,'1',command[1],*command[2:],input=value)
                return run('docker','exec','-i',redis_name,'redis-cli','--raw',*command)

            def ready():
                try:
                    return sql('SELECT 1') == '1' and redis('PING') == 'PONG'
                except subprocess.CalledProcessError:
                    return False

            wait_until(ready)
            sql((ROOT / 'atesta-gateway/database/schema/ponto.sql').read_text())
            password_hash = node(dict(op='hash', password=password))
            private.append(password_hash)
            sql("""INSERT INTO diretorias_ensino(id,nome,codigo) VALUES (1,'Fictional DRE A','PUNCH-A'),(2,'Fictional DRE B','PUNCH-B');
                INSERT INTO unidades_escolares(id,diretoria_ensino_id,nome,latitude,longitude,raio_permitido_metros) VALUES
                (1,1,'Fictional School A',0,0,100),(2,2,'Fictional School B',1,1,100);
                INSERT INTO cargos(id,cargo) VALUES (1,'FUNCIONARIO');
                INSERT INTO usuarios_administrativos(id,cpf,nome,email,ativo) VALUES (1,'10000000001','Fictional Director','admin@example.invalid',1);
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,unidade_escolar_id,status) VALUES (1,'DIRETOR',1,'ATIVO');""")
            employee_rows = []
            for n in range(1, 81):
                employee_rows.append(f"""INSERT INTO funcionarios(id,cpf,nome,email,ativo) VALUES ({n},'{E.cpf(n)}','Fictional Employee {n}','employee{n}@example.invalid',1);
                    INSERT INTO login_funcionario(funcionario_id,senha_hash,primeiro_acesso) VALUES ({n},'{password_hash}',0);
                    INSERT INTO vinculos_funcionais(id,funcionario_id,unidade_escolar_id,cargo_id,horario_entrada,horario_saida_almoco,horario_volta_almoco,horario_saida,data_inicio,status)
                    VALUES ({n},{n},{2 if n == 23 else 1},1,'08:00','12:00','13:00','17:00','{today}','ATIVO');""")
            sql('\n'.join(employee_rows))
            sql("""UPDATE funcionarios SET ativo=0 WHERE id=3; UPDATE vinculos_funcionais SET status='ENCERRADO' WHERE funcionario_id=4;
                UPDATE login_funcionario SET senha_temporaria_expira_em=CURRENT_TIMESTAMP - INTERVAL 1 DAY WHERE funcionario_id=5;""")
            app = 'http://127.0.0.1:' + str(free_port())
            govbr = 'http://127.0.0.1:' + str(provider.server_port)
            S.Provider.secret = provider_secret
            base = {k: os.environ[k] for k in ('PATH', 'JAVA_HOME', 'SystemRoot', 'WINDIR') if k in os.environ}
            environment = dict(base, NODE_ENV='development', DB_HOST='127.0.0.1', DB_PORT=db_port, DB_NAME='punch_check', DB_USER='root', DB_PASSWORD='',
                JWT_SECRET=jwt_secret, SESSION_SECRET=session_secret, INTERNAL_API_SHARED_KEY=key, CORS_ORIGIN=app,
                REDIS_ENABLED='true', REDIS_HOST='127.0.0.1', REDIS_PORT=redis_port, REDIS_NAMESPACE=namespace,
                GOVBR_AUTHORIZE_URL=govbr+'/authorize', GOVBR_TOKEN_URL=govbr+'/token', GOVBR_USERINFO_URL=govbr+'/userinfo',
                GOVBR_CLIENT_ID='punch-check', GOVBR_CLIENT_SECRET=provider_secret, GOVBR_REDIRECT_URI=app+'/auth/govbr/callback',
                ADMIN_SESSION_SECURE='false', ADMIN_SESSION_TTL_SECONDS='900', BCRYPT_SALT_ROUNDS='10', LOGIN_FAILURE_DELAY_MS='10',
                LOGIN_RATE_LIMIT_IP_FAILURE_MAX='10', POINT_RATE_LIMIT_MAX='50', POINT_RATE_LIMIT_WINDOW_MS='60000', RATE_LIMIT_IP_MAX='100',
                MAIL_ENABLED='true', SMTP_HOST='127.0.0.1', SMTP_PORT=str(smtp.server_address[1]), SMTP_USER='fixture', SMTP_PASS=secrets.token_hex(16),
                SMTP_SECURE='false', MAIL_FROM='Fixture <sender@example.invalid>', APP_BASE_URL=app)
            private.append(environment['SMTP_PASS'])
            with (folder / 'spring.log').open('w') as log:
                spring = subprocess.Popen(['java', '-jar', str(JAR), '--server.address=127.0.0.1', '--server.port='+app.rsplit(':', 1)[1]], cwd=folder, env=environment, stdout=log, stderr=log)
                processes.append(spring)
            wait_until(lambda: spring.poll() is not None or Browser().request(app+'/auth/govbr/start')[0] == 302)
            if spring.poll() is not None:
                raise RuntimeError('Spring encerrou no startup: ' + safe((folder/'spring.log').read_text()[-5000:]))
            check(True, 'Java 21, Spring real e JDBC/MySQL 8.4/Redis 7/SMTP/Gov.br isolados; sem Express')

            def clear_rates():
                keys = redis('KEYS', namespace+':ponto:rate_limit:*').splitlines()
                if keys:
                    redis('DEL', *keys)

            def api(path, method='POST', data=None, expected=200, token=None, browser=None, headers=None):
                nonlocal requests
                requests += 1
                options = {'Origin': app, 'Content-Type': 'application/json', **(headers or {})}
                if token:
                    options['Authorization'] = 'Bearer ' + token
                status, response_headers, raw = (browser or Browser()).request(app+path, method, None if data is None else json.dumps(data, separators=(',', ':')).encode(), options)
                if status != expected:
                    try:
                        code = json.loads(raw).get('error', {}).get('code', 'sem codigo')
                    except ValueError:
                        code = 'nao JSON'
                    raise AssertionError(f'{method} {path.split("?")[0]}: esperado {expected}, recebido {status} ({code})')
                payload = json.loads(raw)
                if not path.startswith('/internal/'):
                    assert payload.get('success') is (expected < 400), 'Envelope publico divergente'
                    assert response_headers.get('Cache-Control') == 'no-store', 'Cache publico permitido'
                return payload.get('data', payload), response_headers

            def login(n, browser=None, expected=200, pwd=None, field='identificador', value=None, extra=None):
                return api('/api/pontos/login', data={field: E.cpf(n) if value is None else value, 'senha': password if pwd is None else pwd, **(extra or {})}, browser=browser, expected=expected)

            def token(n):
                try:
                    result, _ = login(n)
                    private.append(result['token'])
                    return result['token']
                except (AssertionError, KeyError) as failure:
                    raise Blocked('Login da fixture '+str(n)+' indisponivel: '+str(failure)) from None

            def jwt(claims, secret=jwt_secret):
                encode = lambda x: base64.urlsafe_b64encode(x).decode().rstrip('=')
                value = encode(b'{"alg":"HS256","typ":"JWT"}') + '.' + encode(json.dumps(claims, separators=(',', ':')).encode())
                result = value + '.' + encode(hmac.new(secret.encode() if isinstance(secret, str) else secret, value.encode(), hashlib.sha256).digest())
                private.append(result)
                return result

            def claims(n):
                hash_value = sql(f'SELECT senha_hash FROM login_funcionario WHERE funcionario_id={n}')
                version = hmac.new(jwt_secret.encode(), json.dumps(['employee-credential-v1', str(n), hash_value], separators=(',', ':')).encode(), hashlib.sha256).hexdigest()
                return dict(sub=str(n), role='funcionario', credentialVersion=version, iat=int(time.time()), exp=int(time.time())+1200)

            def signed(path, body, ts=None, request_id=None):
                raw = json.dumps(body, separators=(',', ':')).encode()
                ts, request_id = str(int(time.time()) if ts is None else ts), request_id or str(uuid.uuid4())
                canonical = '\n'.join(('POST', path, ts, request_id, hashlib.sha256(raw).hexdigest()))
                return {'X-Internal-Timestamp': ts, 'X-Internal-Request-Id': request_id, 'X-Internal-Signature': hmac.new(key.encode(), canonical.encode(), hashlib.sha256).hexdigest()}

            def internal(path, body):
                return api(path, data=body, headers=signed(path, body))[0]

            def gps(**extra):
                value = dict(chaveIdempotencia=str(uuid.uuid4()), latitude=0, longitude=0, accuracy=5, timestamp=int(time.time()*1000))
                value.update(extra)
                return value

            def punch(n, body=None, path='registrar', expected=201, auth=None):
                return api('/api/pontos/'+path, data=gps() if body is None else body, token=auth or token(n), expected=expected)[0]

            def rows(n):
                return int(sql(f'SELECT COUNT(*) FROM registro_de_pontos p JOIN vinculos_funcionais v ON v.id=p.vinculo_funcional_id WHERE v.funcionario_id={n}'))

            def idem(n):
                return int(sql(f'SELECT COUNT(*) FROM ponto_idempotencia WHERE funcionario_id={n}'))

            def audit_count(event, n):
                return sum('evento='+event+' ' in line and f'funcionarioId={n} ' in line for line in (folder/'spring.log').read_text().splitlines())

            def session_key(browser, name):
                cookie = next(c.value for c in browser.cookies if c.name == name)
                decoded = urllib.parse.unquote(cookie)
                sid = decoded[2:decoded.rindex('.')]
                return namespace+':ponto:session:'+hashlib.sha256(sid.encode()).hexdigest()

            def state(browser):
                return json.loads(redis('GET', session_key(browser, 'ponto_recovery')))

            def set_state(browser, value):
                redis('SET', session_key(browser, 'ponto_recovery'), 'KEEPTTL', value=json.dumps(value))

            def recovery(n, browser=None):
                browser = browser or Browser()
                before = len(E.Mailbox.messages)
                started = time.monotonic()
                data, headers = api('/api/pontos/recuperar-senha/solicitar', data={'cpf': E.cpf(n)}, expected=202, browser=browser)
                elapsed = time.monotonic()-started
                wait_until(lambda: any(m['To'] == f'employee{n}@example.invalid' for m in E.Mailbox.messages[before:]), timeout=10)
                message = next(m for m in reversed(E.Mailbox.messages[before:]) if m['To'] == f'employee{n}@example.invalid')
                code = re.search(r'\b[0-9]{6}\b', message.get_content()).group()
                private.append(code)
                return browser, code, data, headers, elapsed

            def verify(browser, code, expected=200):
                return api('/api/pontos/recuperar-senha/validar', data={'codigo': code}, browser=browser, expected=expected)[0]

            def reset(browser, expected=200):
                return api('/api/pontos/recuperar-senha/redefinir', data={'novaSenha': changed}, browser=browser, expected=expected)[0]

            def check_login():
                result, _ = login(1, value=f'{E.cpf(1)[:3]}.{E.cpf(1)[3:6]}.{E.cpf(1)[6:9]}-{E.cpf(1)[9:]}')
                check(set(result) == {'token','expiresIn','primeiro_acesso','funcionario'} and result['primeiro_acesso'] is False, 'Login CPF formatado: contrato normal, CPF mascarado e sem hash')
                check(result['funcionario']['cpf'].startswith('***.') and set(result['funcionario']) == {'id','nome','email','cpf'}, 'Projecao de identidade publica preservada')
                for field in ('identificador','login','email'):
                    email_result, _ = login(1, field=field, value=' EMPLOYEE1@EXAMPLE.INVALID ')
                    check(email_result['funcionario']['id'] == 1, 'Login e-mail/alias '+field+' normalizado')
                check(sql('SELECT ultimo_login_em IS NOT NULL FROM login_funcionario WHERE funcionario_id=1') == '1', 'Login confirmado persiste ultimo_login_em')
                errors = []
                for n, pwd in ((2, 'SenhaIncorreta99'), (99, password), (3, password), (4, password), (5, password)):
                    errors.append(login(n, pwd=pwd, expected=401)[0]['error']['message'])
                check(len(set(errors)) == 1, 'Senha errada, inexistente, inativo, sem vinculo e temporaria vencida: mesmo 401')
                check(sql('SELECT COUNT(*) FROM login_funcionario WHERE funcionario_id IN (2,3,4,5) AND ultimo_login_em IS NOT NULL') == '0', 'Login recusado nao altera ultimo_login_em')
                login(1, value='11111111111', expected=422)
                login(1, pwd='short', expected=422)
                check(True, 'CPF invalido e senha curta: validacao 422')
                unicode_password = 'a'*71+'á'
                unicode_hash = node(dict(op='hash', password=unicode_password))
                private.extend((unicode_password, unicode_hash))
                sql(f"UPDATE login_funcionario SET senha_hash='{unicode_hash}' WHERE funcionario_id=6")
                check(login(6, pwd=unicode_password)[0]['funcionario']['id'] == 6, 'BCrypt Node: corte em 72 bytes no meio de UTF-8 aceito pelo Spring')
                sql(f"UPDATE login_funcionario SET senha_hash='{password_hash.replace('$2b$', '$2a$')}' WHERE funcionario_id=7")
                check(login(7)[0]['funcionario']['id'] == 7 and node(dict(op='check', password=password, hash=password_hash)), 'Hashes BCrypt 2a/2b reais e rounds 10 compativeis')
            scenario('login', check_login)

            def check_jwt():
                auth = token(8)
                decoded = node(dict(op='verify', token=auth, key=jwt_secret))
                check(decoded['sub'] == '8' and decoded['role'] == 'funcionario' and decoded['credentialVersion'] == claims(8)['credentialVersion'], 'Node verifica JWT Spring e HMAC da credencial persistida')
                api('/api/pontos/hoje', 'GET', token=auth)
                bad_payload = dict(claims(8), exp=int(time.time())-10)
                for bad in (jwt(bad_payload), auth[:-3]+('A' if auth[-3] != 'A' else 'B')+auth[-2:], 'forged', jwt(dict(claims(8), nbf=int(time.time())+60)), jwt({k:v for k,v in claims(8).items() if k != 'credentialVersion'})):
                    api('/api/pontos/hoje', 'GET', token=bad, expected=401)
                check(True, 'JWT expirado, adulterado, malformado, futuro e sem versao de credencial: 401')
                api('/api/pontos/hoje', 'GET', token=jwt(dict(claims(8), role='admin')), expected=403)
                check(True, 'Role administrativa no JWT nao concede acesso de funcionario')
                sql('UPDATE funcionarios SET ativo=0 WHERE id=8')
                try:
                    for path, method in (('hoje','GET'),('historico','GET'),('registrar','POST')):
                        api('/api/pontos/'+path, method, data=gps() if method == 'POST' else None, token=auth, expected=401)
                    check(True, 'Funcionario desativado apos emissao perde acesso a consultas e ponto')
                finally:
                    sql('UPDATE funcionarios SET ativo=1 WHERE id=8')
            scenario('jwt', check_jwt)

            def first(n):
                sql(f'UPDATE login_funcionario SET primeiro_acesso=1,senha_temporaria_expira_em=CURRENT_TIMESTAMP + INTERVAL 1 DAY WHERE funcionario_id={n}')
                result, _ = login(n)
                proof = result.get('token_primeiro_acesso')
                if not proof:
                    raise Blocked('Comprovante de primeiro acesso nao emitido')
                private.append(proof)
                return result, proof

            def check_first():
                result, proof = first(10)
                check(result['primeiro_acesso'] is True and 'token' not in result and sql('SELECT ultimo_login_em IS NULL FROM login_funcionario WHERE funcionario_id=10') == '1', 'Primeiro acesso emite somente comprovante; nao grava login normal')
                first_key = hashlib.sha256((jwt_secret+':first-access-password-change:v1').encode()).hexdigest()
                check(node(dict(op='verify', token=proof, key=first_key, first=True))['purpose'] == 'primeira_troca_senha', 'JWT de primeiro acesso usa a chave derivada compativel com Node')
                api('/api/pontos/hoje', 'GET', token=proof, expected=401)
                api('/api/pontos/hoje', 'GET', token=jwt(claims(10)), expected=403)
                expired = jwt(dict(sub='10', purpose='primeira_troca_senha', exp=1), bytes.fromhex(first_key))
                api('/api/pontos/primeiro-acesso/trocar-senha', data={'novaSenha':changed}, token=expired, expected=401)
                api('/api/pontos/primeiro-acesso/trocar-senha', data={'novaSenha':changed}, token=token(1), expected=401)
                check(True, 'Comprovante nao autentica ponto; JWT normal/expirado nao autoriza primeira troca')
                old = jwt(claims(10))
                api('/api/pontos/primeiro-acesso/trocar-senha', data={'novaSenha':changed}, token=proof)
                api('/api/pontos/primeiro-acesso/trocar-senha', data={'novaSenha':changed}, token=proof, expected=409)
                current_hash = sql('SELECT senha_hash FROM login_funcionario WHERE funcionario_id=10')
                check(node(dict(op='check', password=changed, hash=current_hash)) and sql('SELECT primeiro_acesso=0 AND senha_temporaria_expira_em IS NULL AND senha_alterada_em IS NOT NULL FROM login_funcionario WHERE funcionario_id=10') == '1', 'Troca BCrypt atomica limpa senha temporaria e primeiro acesso')
                login(10, expected=401)
                login(10, pwd=changed)
                api('/api/pontos/hoje', 'GET', token=old, expected=401)
                check(True, 'Senha temporaria e JWT antigo recusados; nova senha autentica')
                _, concurrent_proof = first(11)
                def change(_):
                    return Browser().request(app+'/api/pontos/primeiro-acesso/trocar-senha', 'POST', json.dumps({'novaSenha':changed}).encode(), {'Content-Type':'application/json','Origin':app,'Authorization':'Bearer '+concurrent_proof})[0]
                with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                    statuses = list(pool.map(change, range(4)))
                check(statuses.count(200) == 1 and statuses.count(409) == 3, 'Quatro trocas concorrentes: uma confirma, tres conflitos')
            scenario('primeiro-acesso', check_first)

            def check_recovery():
                old = token(12)
                browser, code, data, headers, elapsed = recovery(12)
                check(elapsed >= .29 and set(data) == {'message'}, 'Solicitacao 202 generica, pelo menos 300 ms e codigo entregue pelo SMTP local')
                cookie = headers.get('Set-Cookie', '')
                check('ponto_recovery=' in cookie and 'HttpOnly' in cookie and 'SameSite=Lax' in cookie and 'Max-Age=900' in cookie and 'Path=/' in cookie, 'Cookie de recuperacao separado, atributos e TTL de 15 minutos')
                recovery_state = state(browser)
                ttl = int(redis('PTTL', session_key(browser,'ponto_recovery')))
                check(re.fullmatch('[a-f0-9]{64}', recovery_state['passwordRecovery']['codeHash']) is not None and code not in json.dumps(recovery_state) and 0 < ttl <= 900000, 'Redis persiste somente hash do codigo e TTL limitado')
                reset(browser, expected=401)
                verify(browser, '000000', expected=401)
                verify(browser, code)
                check(int(redis('PTTL', session_key(browser,'ponto_recovery'))) <= ttl, 'Validacao nao renova TTL e troca exige codigo confirmado')
                cookie_header = '; '.join(c.name+'='+c.value for c in browser.cookies)
                def consume(_):
                    return Browser().request(app+'/api/pontos/recuperar-senha/redefinir','POST',json.dumps({'novaSenha':changed}).encode(),{'Origin':app,'Content-Type':'application/json','Cookie':cookie_header})[0]
                with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
                    statuses = list(pool.map(consume, range(6)))
                check(statuses.count(200) == 1 and statuses.count(401) == 5, 'Seis redefinicoes concorrentes: autorizacao consumida exatamente uma vez')
                check(node(dict(op='check',password=changed,hash=sql('SELECT senha_hash FROM login_funcionario WHERE funcionario_id=12'))), 'Senha recuperada persistida como BCrypt verificado pelo Node')
                api('/api/pontos/hoje','GET',token=old,expected=401)
                login(12, pwd=changed)
                check(True, 'Recuperacao invalida JWT anterior e nova senha autentica')
                exhausted, right, *_ = recovery(16)
                for _ in range(5):
                    verify(exhausted, '000000', expected=401)
                verify(exhausted, right, expected=401)
                check(True, 'Cinco erros esgotam recuperacao e codigo correto posterior e recusado')
                expired_browser, right, *_ = recovery(17)
                value = state(expired_browser); value['passwordRecovery']['expiresAt'] = int(time.time()*1000)-1; set_state(expired_browser,value)
                verify(expired_browser,right,expected=401)
                ttl_browser, right, *_ = recovery(18)
                redis('PEXPIRE',session_key(ttl_browser,'ponto_recovery'),'1');time.sleep(.03)
                verify(ttl_browser,right,expected=401)
                check(True, 'Expiracao absoluta e expiracao Redis recusam codigo')
                old_browser, old_code, *_ = recovery(19)
                old_cookie = '; '.join(c.name+'='+c.value for c in old_browser.cookies)
                recovery(19, old_browser)
                api('/api/pontos/recuperar-senha/validar',data={'codigo':old_code},headers={'Cookie':old_cookie},expected=401)
                check(True, 'Nova solicitacao revoga a sessao/codigo anterior')
                before = len(E.Mailbox.messages)
                for n in (99,3,20):
                    if n == 20:
                        sql('UPDATE login_funcionario SET primeiro_acesso=1 WHERE funcionario_id=20')
                    dummy=Browser(); missing,_=api('/api/pontos/recuperar-senha/solicitar',data={'cpf':E.cpf(n)},expected=202,browser=dummy)
                    check(missing == data, 'Conta inelegivel '+str(n)+': mesmo 202 e mensagem sem enumeracao')
                    value=state(dummy);value['passwordRecovery']['codeHash']=hashlib.sha256(('123456:'+session_secret).encode()).hexdigest();set_state(dummy,value)
                    verify(dummy,'123456',expected=401)
                time.sleep(.4)
                check(len(E.Mailbox.messages)==before, 'Inexistente, inativo e primeiro acesso nao enviam e-mail nem autorizam troca')
            scenario('recuperacao', check_recovery)

            def qr_browser(qr_token, expires=None, ttl=900000, extra=None):
                sid=secrets.token_urlsafe(24)
                signature=base64.b64encode(hmac.new(session_secret.encode(),sid.encode(),hashlib.sha256).digest()).decode().rstrip('=')
                cookie=urllib.parse.quote('s:'+sid+'.'+signature,safe='')
                browser=Browser()
                browser.cookies.set_cookie(http.cookiejar.Cookie(0,'ponto_qr_acesso',cookie,None,False,'127.0.0.1',False,False,'/',True,False,None,True,None,None,{'HttpOnly':None},False))
                session={'cookie':{'expires':expires or (dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=15)).isoformat().replace('+00:00','Z'),'originalMaxAge':900000},'funcionario_qr':{'token':qr_token},**(extra or {})}
                redis('SET',session_key(browser,'ponto_qr_acesso'),'PX',str(ttl),value=json.dumps(session))
                return browser

            def generate_qr(unit=1):
                result=internal('/internal/escolas/qr/gerar',{'unidade_escolar_id':unit,'base_url':app})
                value=urllib.parse.parse_qs(urllib.parse.urlsplit(result['qrCode']['url']).query)['qr'][0]
                private.append(value)
                return value

            def check_qr():
                value=generate_qr()
                browser=qr_browser(value,ttl=200000)
                check(login(22,browser=browser)[0]['funcionario']['id']==22, 'Cookie QR assinado resolve unidade no Redis sem Express')
                check(int(redis('PTTL',session_key(browser,'ponto_qr_acesso')))<=200000, 'Login QR nao renova TTL do contexto')
                sql('UPDATE login_funcionario SET ultimo_login_em=NULL WHERE funcionario_id=23')
                login(23,browser=browser,extra={'unidade_escolar_id':1,'unidadeEscolarIdQr':2},expected=403)
                check(sql('SELECT ultimo_login_em IS NULL FROM login_funcionario WHERE funcionario_id=23')=='1','QR de outra escola nega login antes de ultimo_login_em; unidade cliente ignorada')
                old_cookie='; '.join(c.name+'='+c.value for c in browser.cookies)
                old_key=session_key(browser,'ponto_qr_acesso')
                generate_qr()
                _, headers=login(22,browser=browser,expected=403)
                check('Max-Age=0' in headers.get('Set-Cookie','') and 'funcionario_qr' not in json.loads(redis('GET',old_key)), 'QR revogado revalidado no login; contexto e cookie removidos')
                login(23,browser=browser)
                login(23,extra={'unidade_escolar_id':1,'qr':value})
                login(23,extra={'unidade_escolar_id':1},browser=Browser())
                api('/api/pontos/login',data={'cpf':E.cpf(23),'senha':password},headers={'Cookie':old_cookie})
                check(True,'Contexto residual ja limpo e cookie antigo nao reautorizam QR nem bloqueiam login direto legitimo')
                value=generate_qr()
                expired_browser=qr_browser(value,expires='2000-01-01T00:00:00Z')
                _, headers=login(23,browser=expired_browser)
                check('Max-Age=0' in headers.get('Set-Cookie',''),'Contexto QR expirado limpa cookie e nao impoe unidade residual')
                ttl_browser=qr_browser(value,ttl=1);time.sleep(.03);login(23,browser=ttl_browser)
                cookie_only=qr_browser(value,extra={'passwordRecovery':{'verified':True,'employeeId':23,'expiresAt':int(time.time()*1000)+60000}})
                reset(cookie_only,expected=401)
                api('/api/pontos/hoje','GET',browser=cookie_only,expected=401)
                check(True,'Cookie QR nao autentica ponto nem substitui cookie de recuperacao')
            scenario('qr', check_qr)

            def check_punch():
                auth=token(24)
                initial,_=api('/api/pontos/hoje','GET',token=auth)
                check(initial['proxima_batida']=='ENTRADA' and initial['ponto']['entrada'] is None and initial['jornada']['entrada']=='08:00:00','Hoje antes de bater: jornada e primeira marcacao vazia')
                for index,kind in enumerate(('ENTRADA','SAIDA_ALMOCO','RETORNO_ALMOCO','SAIDA'),1):
                    result=punch(24,gps(funcionario_id=23,unidade_escolar_id=2),path='registrar' if index%2 else 'bater',auth=auth)
                    check(result['ponto']['tipo']==kind and result['ponto']['sequencia']==index and result['funcionario']['id']==24 and 'replayed' not in result,'Registrar/bater 201, sequencia '+str(index)+' e identidade exclusivamente do JWT')
                punch(24,auth=auth,expected=409)
                complete,_=api('/api/pontos/hoje','GET',token=auth)
                check(complete['jornada_concluida'] and complete['proxima_batida'] is None and rows(24)==4 and idem(24)==4,'Quinta batida nega 409; hoje concluido; quatro registros/idempotencias')
                for kind,hour in zip(('ENTRADA','SAIDA_ALMOCO','RETORNO_ALMOCO','SAIDA'),('08:00:00','12:00:00','13:00:00','17:00:00')):
                    sql(f"UPDATE registro_de_pontos SET registrado_em='{today} {hour}' WHERE vinculo_funcional_id=24 AND tipo='{kind}'")
                history,_=api('/api/pontos/historico?mes='+month,'GET',token=auth)
                check(history['periodo']==month and history['resumo']['total_minutos']==480 and history['registros'][0]['status']=='COMPLETO','Historico calcula oito horas em jornada completa')
                sql(f"""INSERT INTO vinculos_funcionais(id,funcionario_id,unidade_escolar_id,cargo_id,horario_entrada,horario_saida_almoco,horario_volta_almoco,horario_saida,data_inicio,status)
                  VALUES (1001,24,2,1,'08:00','12:00','13:00','17:00','{today}','ENCERRADO');
                  INSERT INTO registro_de_pontos(vinculo_funcional_id,data_referencia,tipo,registrado_em) VALUES (1001,'{today}','ENTRADA','{today} 07:00:00');""")
                history,_=api('/api/pontos/historico','GET',token=auth)
                check(len(history['registros'])==2 and history['resumo']['dias_com_registro']==1 and {r['unidade_escolar_id'] for r in history['registros']}=={1,2},'Historico separa vinculos/transferencias no mesmo dia sem duplicar contagem de dias')
                for query in ('mes=2026-13','mes=bad','mes=2026-01&mes=2026-02'):
                    api('/api/pontos/historico?'+query,'GET',token=auth,expected=400)
                check(True,'Historico rejeita mes invalido, malformado e repetido')
            scenario('ponto',check_punch)

            def check_geo():
                auth=token(25)
                for body,status,description in (
                    (gps(latitude=.01),403,'GPS fora da escola'),(gps(latitude=.00072,accuracy=30),403,'Margem de precisao ultrapassa raio'),
                    (gps(accuracy=101),400,'Precisao acima de 100 metros'),(gps(accuracy=0),422,'Precisao nula'),
                    (gps(timestamp=int(time.time()*1000)-120000),400,'Leitura GPS vencida'),(gps(timestamp=int(time.time()*1000)+60000),400,'Leitura GPS futura'),
                    (gps(latitude='0'),422,'Latitude textual'),(gps(latitude=91),422,'Latitude fora do intervalo'),(gps(timestamp=1.5),422,'Timestamp fracionario')):
                    punch(25,body,auth=auth,expected=status)
                    check(rows(25)==0 and idem(25)==0,description+': nega sem escrita')
                legacy=dict(chaveIdempotencia=str(uuid.uuid4()),latitude=0,longitude=0)
                punch(25,legacy,auth=auth,expected=400)
                check(rows(25)==0,'Nova acao sem accuracy/timestamp negada')
                result=punch(25,gps(latitude=.0002,accuracy=10),auth=auth)
                check(20 < result['ponto']['distancia_metros'] < 25,'GPS dentro da escola: distancia em metros calculada')
                result=punch(25,gps(accuracy=100),auth=auth)
                check(result['ponto']['sequencia']==2,'Precisao no limite de 100 metros aceita no centro')
            scenario('geo',check_geo)

            def check_idempotency():
                auth=token(26);body=gps();before=audit_count('batida_ponto_realizada',26)
                first_result=punch(26,body,auth=auth)
                replay=punch(26,body,path='bater',auth=auth)
                uppercase=dict(body,chaveIdempotencia=body['chaveIdempotencia'].upper())
                replay_upper=punch(26,uppercase,auth=auth)
                check(first_result==replay==replay_upper and rows(26)==1 and idem(26)==1,'Replay entre registrar/bater e UUID maiusculo retorna resposta original sem nova escrita')
                punch(26,dict(body,latitude=.00000001),auth=auth,expected=409)
                check(rows(26)==1 and audit_count('batida_ponto_realizada',26)==before+1,'Mesma chave com leitura diferente: conflito; replay nao duplica auditoria')
                legacy_key=str(uuid.uuid4());legacy_hash=hashlib.sha256(b'[0,0]').hexdigest()
                sql(f"INSERT INTO ponto_idempotencia(funcionario_id,chave,requisicao_hash,resposta) VALUES (26,'{legacy_key}','{legacy_hash}','{json.dumps(first_result)}')")
                legacy=punch(26,dict(chaveIdempotencia=legacy_key,latitude=0,longitude=0),auth=auth)
                check(legacy==first_result and rows(26)==1,'Replay legado de leitura JSON [0,0] preservado')
                other=punch(27,body)
                check(other['funcionario']['id']==27 and rows(27)==1,'Chave de idempotencia e isolada por funcionario')
            scenario('idempotencia',check_idempotency)

            def parallel_punch(auth,bodies):
                barrier=threading.Barrier(len(bodies))
                def act(body):
                    barrier.wait(timeout=10)
                    status,_,raw=Browser().request(app+'/api/pontos/registrar','POST',json.dumps(body).encode(),{'Origin':app,'Content-Type':'application/json','Authorization':'Bearer '+auth})
                    return status,json.loads(raw)
                with concurrent.futures.ThreadPoolExecutor(max_workers=len(bodies)) as pool:
                    return list(pool.map(act,bodies))

            def check_concurrency():
                # Sem excluir a cota de ponto: seis concorrentes cabem na janela da fixture.
                auth=token(28);body=gps();responses=parallel_punch(auth,[body]*6)
                check(all(s==201 for s,_ in responses) and len({json.dumps(r,sort_keys=True) for _,r in responses})==1,'Seis replays simultaneos: seis respostas 201 identicas')
                check(rows(28)==1 and idem(28)==1 and audit_count('batida_ponto_realizada',28)==1,'Locks reais MySQL preservam uma escrita e uma auditoria sob concorrencia')
                auth=token(29);responses=parallel_punch(auth,[gps() for _ in range(6)])
                check(sum(s==201 for s,_ in responses)==4 and sum(s==409 for s,_ in responses)==2,'Seis chaves concorrentes: quatro marcacoes e dois conflitos de jornada completa')
                check(rows(29)==4 and idem(29)==4 and audit_count('batida_ponto_realizada',29)==4,'Sequencia e idempotencia atomicas com chaves distintas; sem 500/deadlock')
            scenario('concorrencia',check_concurrency)

            def check_rollback():
                auth=token(30);body=gps();before=audit_count('batida_ponto_realizada',30)
                sql("CREATE TRIGGER fail_punch_idem BEFORE INSERT ON ponto_idempotencia FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fictional idempotency failure'")
                try:
                    punch(30,body,auth=auth,expected=500)
                    check(rows(30)==0 and idem(30)==0 and audit_count('batida_ponto_realizada',30)==before,'Falha apos INSERT de ponto: rollback de ponto/idempotencia e nenhuma auditoria de sucesso')
                finally:
                    sql('DROP TRIGGER fail_punch_idem')
                check(punch(30,body,auth=auth)['ponto']['sequencia']==1,'Mesma chave pode ser repetida apos rollback real')
                _,proof=first(31)
                sql("CREATE TRIGGER fail_password BEFORE UPDATE ON login_funcionario FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fictional password failure'")
                try:
                    api('/api/pontos/primeiro-acesso/trocar-senha',data={'novaSenha':changed},token=proof,expected=502)
                    check(sql('SELECT primeiro_acesso FROM login_funcionario WHERE funcionario_id=31')=='1' and sql('SELECT senha_hash FROM login_funcionario WHERE funcionario_id=31')==password_hash and audit_count('senha_primeiro_acesso_atualizada',31)==0,'Falha JDBC na primeira troca preserva credencial/estado e nao audita sucesso')
                finally:
                    sql('DROP TRIGGER fail_password')
                api('/api/pontos/primeiro-acesso/trocar-senha',data={'novaSenha':changed},token=proof)
                browser,code,*_=recovery(32);verify(browser,code)
                sql("CREATE TRIGGER fail_password BEFORE UPDATE ON login_funcionario FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fictional recovery failure'")
                try:
                    reset(browser,expected=502)
                    check(sql('SELECT senha_hash FROM login_funcionario WHERE funcionario_id=32')==password_hash and audit_count('senha_funcionario_redefinida',32)==0,'Recuperacao com falha JDBC nao altera senha nem audita sucesso')
                finally:
                    sql('DROP TRIGGER fail_password')
                reset(browser,expected=401)
                check(True,'Autorizacao de recuperacao falhada continua consumida; exige nova solicitacao')
            scenario('rollback',check_rollback)

            def check_audit():
                auth=token(33);login(33,pwd='SenhaErrada99',expected=401)
                _,proof=first(34)
                api('/api/pontos/primeiro-acesso/trocar-senha',data={'novaSenha':changed},token=proof)
                browser,code,*_=recovery(35);verify(browser,code);reset(browser)
                body=gps();user_agent='Bearer '+secrets.token_hex(16);private.append(user_agent)
                api('/api/pontos/registrar',data=body,token=auth,expected=201,headers={'User-Agent':user_agent})
                punch(33,body,auth=auth)
                wait_until(lambda:audit_count('recuperacao_senha_solicitada',35)==1)
                for event,n in (('funcionario_login_sucesso',33),('funcionario_primeiro_acesso_validado',34),('senha_primeiro_acesso_atualizada',34),('recuperacao_senha_solicitada',35),('senha_funcionario_redefinida',35),('batida_ponto_realizada',33)):
                    check(audit_count(event,n)==1,'Evento '+event+' confirmado uma vez no log')
                logs=(folder/'spring.log').read_text()
                check('evento=funcionario_login_invalido nivel=WARN' in logs and 'user_agent=[REDACTED]' in logs,'Tentativa invalida audita WARN; User-Agent sensivel redigido')
                forbidden=[password,changed,jwt_secret,session_secret,key,password_hash,auth,proof,code,user_agent,E.cpf(33),E.cpf(35)]
                check(not any(value in logs for value in forbidden),'Logs nao expoem senhas, hashes, JWT, chave, codigo ou CPF de login/recuperacao')
            scenario('auditoria',check_audit)

            def check_limits():
                for _ in range(5):login(36,pwd='SenhaErrada99',expected=401)
                _,headers=login(36,expected=429)
                check('Retry-After' in headers and 'login-identity' in ','.join(headers.get_all('RateLimit-Policy',[])),'Cinco falhas por identidade; sexta retorna 429 e cabecalhos de cota')
                clear_rates()
                for _ in range(7):login(36)
                subject='cpf:'+E.cpf(36)
                digest=hmac.new(session_secret.encode(),json.dumps(['rate-limit-v1',subject],separators=(',',':')).encode(),hashlib.sha256).hexdigest()
                check(redis('HGET',namespace+':ponto:rate_limit:login-identity:'+digest,'hits')=='0','Logins bem-sucedidos descontam reservas na chave HMAC compativel com Node')
                clear_rates()
                for n in range(37,47):login(n,pwd='SenhaErrada99',expected=401)
                login(36,expected=429)
                check(True,'Limite agregado de falhas por IP bloqueia tentativa correta apos dez falhas')
                clear_rates();auth=token(47);body=gps()
                for _ in range(50):punch(47,body,auth=auth)
                punch(47,body,auth=auth,expected=429)
                for rate_key in redis('KEYS',namespace+':ponto:rate_limit:point:*').splitlines():
                    redis('PEXPIRE',rate_key,'1')
                time.sleep(.03);punch(47,body,auth=auth)
                check(rows(47)==1,'Cota por ID autenticado limita replay e libera apos janela; sem duplicacao')
                clear_rates()
                for _ in range(5):api('/api/pontos/recuperar-senha/solicitar',data={'cpf':E.cpf(48)},expected=202)
                api('/api/pontos/recuperar-senha/solicitar',data={'cpf':E.cpf(48)},expected=429)
                check(True,'Recuperacao limitada por CPF normalizado a cinco solicitacoes')
                clear_rates()
                for _ in range(40):api('/api/pontos/primeiro-acesso/trocar-senha',data={'novaSenha':changed},expected=401)
                api('/api/pontos/primeiro-acesso/trocar-senha',data={'novaSenha':changed},expected=429)
                check(True,'Cota sensivel limita primeira troca sem sessao a 40 tentativas')
                clear_rates()
                for _ in range(100):api('/api/pontos/registrar',data={},expected=401)
                api('/api/pontos/registrar',data={},expected=429)
                check(True,'Teto de abuso IP protege inclusive autenticacao ausente')
                clear_rates();run('docker','pause',redis_name)
                try:
                    result,_=login(49,expected=503)
                    check(result['error']['code']=='RATE_LIMIT_UNAVAILABLE','Redis indisponivel: falha fechada 503, sem fallback ou JWT')
                finally:
                    run('docker','unpause',redis_name)
                check(login(49)[0]['funcionario']['id']==49,'Redis recuperado: protecao retoma com armazenamento compartilhado')
            scenario('limites',check_limits)

            def admin_login():
                browser=Browser();status,headers,_=browser.request(app+'/auth/govbr/login');assert status==302
                before=browser.sid();_,headers,_=Browser().request(headers['Location']);status,headers,_=browser.request(headers['Location'])
                assert status==302 and headers['Location'].endswith('/admin/dashboard') and before!=browser.sid()
                return browser

            def check_isolation():
                admin=admin_login();sid=admin.sid()
                me,_=api('/api/admin/auth/me','GET',browser=admin)
                check(me['admin']['id']==1 and sid is not None,'Sessao administrativa autentica via Gov.br/PKCE simulado com cadastro real')
                api('/api/pontos/hoje','GET',browser=admin,expected=401)
                auth=token(50)
                api('/api/admin/auth/me','GET',token=auth,expected=401)
                check(True,'Cookie administrativo nao autentica funcionario; JWT funcionario nao autentica administracao')
                login(50,browser=admin)
                api('/api/admin/auth/me','GET',browser=admin)
                recovery(51,admin)
                api('/api/admin/auth/me','GET',browser=admin)
                check(admin.sid()==sid and any(c.name=='ponto_recovery' for c in admin.cookies),'Login/recuperacao publicos nao substituem ou invalidam sessao Gov.br')
                status,_,_=admin.request(app+'/auth/govbr/logout','POST',b'',{'Origin':app})
                check(status==302,'Logout administrativo encerra somente sessao administrativa')
                api('/api/pontos/hoje','GET',token=auth)
                check(True,'JWT de funcionario permanece independente apos logout administrativo')
            scenario('isolamento',check_isolation)

            def check_hmac():
                path='/internal/ponto/hoje';body={'funcionario_id':52};auth=token(52)
                api(path,data=body,token=auth,expected=401)
                api(path,data=body,headers={'Cookie':'ATESTA_ADMIN_SESSION=forged;ponto_qr_acesso=forged'},expected=401)
                check(True,'JWT/cookies publicos e administrativos nao substituem HMAC interno')
                headers=signed(path,body)
                result,_=api(path,data=body,headers=headers)
                check('funcionario' in result and 'success' not in result,'HMAC valido preserva contrato interno de ponto')
                api(path,data=body,headers=headers,expected=401)
                api(path,data=body,headers=signed(path,body,ts=int(time.time())-121),expected=401)
                api(path,data={'funcionario_id':53},headers=signed(path,body),expected=401)
                check(True,'Request ID repetido, timestamp antigo e corpo adulterado sao rejeitados')
                result=internal('/internal/credenciais-funcionarios/login',{'cpf':E.cpf(52)})
                check(result['employee']['id']==52 and result['employee']['senha_hash']==password_hash,'Credenciais internas continuam acessiveis somente por chamada HMAC valida')
            scenario('hmac',check_hmac)
        except Exception as failure:
            results.append(('FALHOU',current,safe(failure)))
            print('FALHOU '+current+': '+safe(failure),flush=True)
            completed={group for _,group,_ in results}
            for group in GROUPS:
                if group in selected and group not in completed:
                    results.append(('BLOQUEADO',group,'Fixture/infra indisponivel nesta rodada'))
        finally:
            for process in reversed(processes):
                if process.poll() is None:
                    process.terminate()
                    try:process.wait(timeout=15)
                    except subprocess.TimeoutExpired:process.kill();process.wait()
            for server in (smtp,provider):
                server.shutdown();server.server_close()
            for name in reversed(created):
                subprocess.run(['docker','unpause',name],capture_output=True)
                subprocess.run(['docker','rm','-f',name],capture_output=True)
            current='cleanup'
            for description,probe in (
                ('mysql-dev e node-dev preservados: IDs, estado, inicio e reinicios',lambda:run(*SNAPSHOT)==baseline),
                ('.env preservados byte a byte',lambda:all(p.exists() and hashlib.sha256(p.read_bytes()).digest()==v for p,v in protected.items())),
                ('Containers e processos temporarios removidos',lambda:all(n not in run('docker','ps','-a','--format','{{.Names}}').splitlines() for n in created) and all(p.poll() is not None for p in processes))):
                try:check(probe(),description)
                except Exception as failure:results.append(('FALHOU','cleanup',safe(failure)))
            if not REPORT.exists():
                REPORT.write_text('# Homologacao — ponto e autenticacao publicos no Spring\n\nJava 21; Spring/JDBC reais; MySQL 8.4 tmpfs e Redis 7 temporarios; SMTP/Gov.br Python locais.\nHTTP direto no Spring, sem gateway Express. Dados exclusivamente ficticios, sem carregar .env.\n\nReproduzir: `cd backend-spring && ./mvnw -o -DskipTests package && python3 scripts/check-public-punch.py`.\nReexecucao seletiva: `python3 scripts/check-public-punch.py --only qr,geo`.\nRequer Docker, imagens locais e bibliotecas Node instaladas para checagem BCrypt/JWT.\nA fixture injeta cookies QR assinados e registros Redis compativeis sem usar paginas Express.\nSchema, triggers de falha e todos os dados existem somente no MySQL temporario.\nSem commit, merge ou deploy.\n')
            lines=['','## Rodada UTC '+dt.datetime.now(dt.timezone.utc).isoformat(),'','Grupos: '+(args.only or 'todos')+'. Requisicoes instrumentadas: '+str(requests)+'.','',
                   '| Resultado | Grupo | Cenario |','|---|---|---|']
            lines += [f'| {status} | {group} | {description.replace(chr(10)," ").replace("|","/")} |' for status,group,description in results]
            lines += ['','Totais: '+'; '.join(f'{status}={sum(s==status for s,_,_ in results)}' for status in ('PASSOU','FALHOU','BLOQUEADO'))+'.','']
            with REPORT.open('a') as output:output.write('\n'.join(lines))
    if any(status!='PASSOU' for status,_,_ in results):raise SystemExit(1)
    print('PASSOU '+str(len(results))+' verificacoes; '+str(REPORT.relative_to(ROOT)),flush=True)


if __name__=='__main__':
    main()
