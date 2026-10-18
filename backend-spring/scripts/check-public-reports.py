#!/usr/bin/env python3
"""Homologacao HTTP Spring/MySQL/Redis isolados. Nao carrega .env. --only repete grupos."""
import argparse
import datetime as dt
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
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('school_support', Path(__file__).with_name('check-public-schools.py'))
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)
Browser, run, free_port, wait_until = S.Browser, S.run, S.free_port, S.wait_until
ROOT, JAR = S.ROOT, S.JAR
REPORT = ROOT / 'backend-spring/HOMOLOGACAO-RELATORIOS.md'
PATHS = ['/api/admin/pontos/' + p for p in ('hoje', 'relatorio', 'relatorio/semanal', 'relatorio/hierarquia', 'resumo')] + ['/api/admin/auth/me']
SNAPSHOT = ['docker', 'inspect', '--format', '{{.Name}} {{.Id}} {{.State.Status}} {{.State.StartedAt}} {{.RestartCount}}', 'mysql-dev', 'node-dev']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', help='contratos,datas,territorio,sessao,auditoria,hmac,limites')
    args = parser.parse_args()
    selected = set(args.only.split(',')) if args.only else None
    allowed = {'contratos', 'datas', 'territorio', 'sessao', 'auditoria', 'hmac', 'limites'}
    assert selected is None or selected <= allowed, 'Grupo desconhecido'
    assert S.SUPPORT.java21() and JAR.is_file(), 'Empacote com Java 21 primeiro'
    results, processes, created = [], [], []
    prefix = 'atesta-reports-check-' + uuid.uuid4().hex[:10]
    mysql, redis = prefix + '-mysql', prefix + '-redis'
    protected = {p: hashlib.sha256(p.read_bytes()).digest() for p in ROOT.rglob('.env') if 'node_modules' not in p.parts}
    baseline = run(*SNAPSHOT)
    today = dt.datetime.now(ZoneInfo('America/Sao_Paulo')).date()
    ref = today - dt.timedelta(days=14 + today.weekday())
    end = ref + dt.timedelta(days=6)
    key, secret, session_secret = [secrets.token_hex(32) for _ in range(3)]
    private = [key, secret, session_secret]
    current = 'infra'
    requests = 0

    def check(ok, description):
        if not ok:
            raise AssertionError(description)
        results.append(('PASSOU', current, description))
        print('PASSOU ' + current + ': ' + description, flush=True)

    def safe(message):
        for value in private:
            message = message.replace(value, '[redacted]')
        return message[:1600]

    with tempfile.TemporaryDirectory(prefix='atesta-reports-http-') as temporary:
        folder = Path(temporary)
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), S.Provider)
        server.daemon_threads = True
        threading.Thread(target=server.serve_forever, daemon=True).start()
        S.Provider.secret = secret
        try:
            for name, command in ((mysql, ['mysql:8.4', '--innodb-buffer-pool-size=64M']), (redis, ['redis:7-alpine', 'redis-server', '--save', '', '--appendonly', 'no'])):
                options = ['--memory', '512m', '--tmpfs', '/var/lib/mysql:rw,size=512m', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', '-e', 'MYSQL_DATABASE=reports_check'] if name == mysql else ['--memory', '128m']
                port = '3306' if name == mysql else '6379'
                run('docker', 'run', '--rm', '-d', '--name', name, '--label', 'atestaponto.purpose=public-reports-homologation', '-p', '127.0.0.1::' + port, *options, *command)
                created.append(name)
            mysql_port = run('docker', 'port', mysql, '3306/tcp').rsplit(':', 1)[1]
            redis_port = run('docker', 'port', redis, '6379/tcp').rsplit(':', 1)[1]

            def sql(statement):
                try:
                    return run('docker', 'exec', '-i', mysql, 'mysql', '-uroot', '-N', 'reports_check', input=statement)
                except subprocess.CalledProcessError as e:
                    raise RuntimeError(e.stderr.strip()) from None

            def ready():
                try:
                    return sql('SELECT 1') == '1'
                except RuntimeError:
                    return False

            wait_until(ready)
            sql((ROOT / 'atesta-gateway/database/schema/ponto.sql').read_text())
            sql("""
                INSERT INTO diretorias_ensino(id,nome,codigo) VALUES (1,'Fixture DRE A','FIX-A'),(2,'Fixture DRE B','FIX-B'),(3,'Fixture DRE empty','FIX-E');
                INSERT INTO unidades_escolares(id,diretoria_ensino_id,nome,latitude,longitude) VALUES
                (1,1,'Fixture school A',0,0),(2,2,'Fixture school B',0,0),(3,1,'Fixture school C',0,0);
                INSERT INTO cargos(id,cargo) VALUES (1,'Fixture job');
            """)
            for i in range(1, 14):
                sql(f"INSERT INTO usuarios_administrativos(id,cpf,nome,email) VALUES ({i},'1000000{i:04d}','Fixture admin {i}','fixture-admin-{i}@example.invalid')")
            sql("""
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,unidade_escolar_id,status) VALUES
                (1,'DIRETOR',1,'ATIVO'),(5,'VICE_DIRETOR',1,'ATIVO'),(6,'SECRETARIA',1,'ATIVO'),(7,'COORDENADOR',1,'ATIVO'),
                (9,'DIRETOR',1,'ATIVO'),(10,'DIRETOR',1,'ATIVO'),(11,'DIRETOR',1,'ATIVO'),(12,'DIRETOR',1,'ATIVO'),(13,'DIRETOR',3,'ATIVO');
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,diretoria_ensino_id,status) VALUES
                (3,'ADMIN_DIRETORIA',1,'ATIVO'),(4,'ADMIN_DIRETORIA',2,'ATIVO'),(8,'ADMIN_DIRETORIA',3,'ATIVO');
                INSERT INTO acessos_administrativos(usuario_administrativo_id,perfil,status) VALUES (2,'ADMIN_SEDUC','ATIVO'),(9,'ADMIN_SEDUC','ATIVO');
            """)
            for i in range(1, 7):
                sql(f"INSERT INTO funcionarios(id,cpf,email,nome,ativo) VALUES ({i},'2000000{i:04d}','fixture-employee-{i}@example.invalid','Fixture employee {i}',{0 if i == 5 else 1})")
            for link, employee, school in ((1,1,1),(2,2,1),(3,3,2),(4,1,3),(5,4,3),(6,5,1),(7,6,1)):
                start = ref + dt.timedelta(days=1) if link == 7 else ref - dt.timedelta(days=10)
                finish = "'" + str(ref - dt.timedelta(days=1)) + "'" if link == 6 else 'NULL'
                sql(f"INSERT INTO vinculos_funcionais(id,funcionario_id,unidade_escolar_id,cargo_id,horario_entrada,horario_saida_almoco,horario_volta_almoco,horario_saida,data_inicio,data_fim) VALUES ({link},{employee},{school},1,'08:00','12:00','13:00','17:00','{start}',{finish})")
            for date, link, kind, hour in [(ref,1,'ENTRADA','08:00'),(ref,1,'SAIDA_ALMOCO','12:00'),(ref,1,'RETORNO_ALMOCO','13:00'),(ref,1,'SAIDA','17:00'),(ref,3,'ENTRADA','08:30'),(ref,4,'ENTRADA','09:00'),(ref+dt.timedelta(days=1),2,'ENTRADA','08:00'),(today,1,'ENTRADA','08:00')]:
                sql(f"INSERT INTO registro_de_pontos(vinculo_funcional_id,data_referencia,tipo,registrado_em) VALUES ({link},'{date}','{kind}','{date} {hour}:00')")
            app = 'http://127.0.0.1:' + str(free_port())
            provider = 'http://127.0.0.1:' + str(server.server_port)
            base = {k: os.environ[k] for k in ('PATH', 'JAVA_HOME', 'SystemRoot', 'WINDIR') if k in os.environ}
            environment = dict(base, DB_HOST='127.0.0.1', DB_PORT=mysql_port, DB_NAME='reports_check', DB_USER='root', DB_PASSWORD='',
                INTERNAL_API_SHARED_KEY=key, SESSION_SECRET=session_secret, NODE_ENV='production', REDIS_ENABLED='true', REDIS_HOST='127.0.0.1', REDIS_PORT=redis_port,
                REDIS_NAMESPACE='reports-check', ADMIN_SESSION_SECURE='false', ADMIN_SESSION_TTL_SECONDS='600', MAIL_ENABLED='false',
                GOVBR_AUTHORIZE_URL=provider+'/authorize', GOVBR_TOKEN_URL=provider+'/token', GOVBR_USERINFO_URL=provider+'/userinfo',
                GOVBR_CLIENT_ID='reports-check', GOVBR_CLIENT_SECRET=secret, GOVBR_REDIRECT_URI=app+'/auth/govbr/callback', GOVBR_LOGOUT_URL='/', TZ='UTC')
            log_path = folder / 'spring.log'

            def start(ttl=600):
                env = dict(environment, ADMIN_SESSION_TTL_SECONDS=str(ttl))
                with log_path.open('a') as log:
                    process = subprocess.Popen(['java', '-jar', str(JAR), '--server.address=127.0.0.1', '--server.port='+app.rsplit(':',1)[1]], cwd=folder, env=env, stdout=log, stderr=log)
                processes.append(process)
                wait_until(lambda: process.poll() is not None or Browser().request(app+'/auth/govbr/start')[0] == 302)
                assert process.poll() is None, 'Spring encerrou no startup'
                return process

            spring = start()
            check(True, 'Java 21, Spring real, MySQL e Redis temporarios; Gov.br Python local; JVM UTC')

            def clear():
                assert redis in created
                run('docker', 'exec', redis, 'redis-cli', 'FLUSHDB')

            def login(account):
                b = Browser()
                status, headers, _ = b.request(app+'/auth/govbr/login')
                assert status == 302
                old = b.sid()
                _, redirect, _ = Browser().request(headers['Location'], headers={'X-Fixture-Account':str(account)})
                status, headers, raw = b.request(redirect['Location'])
                assert status == 302 and headers['Location'].endswith('/admin/dashboard'), f'Login {account}: {status}'
                assert b.sid() and b.sid() != old and 'HttpOnly' in headers['Set-Cookie'] and 'SameSite=Lax' in headers['Set-Cookie']
                assert 'access_token' not in raw+str(headers)
                return b

            def api(browser, path, expected=200, headers=None):
                nonlocal requests
                requests += 1
                status, h, raw = browser.request(app+path, headers=headers)
                assert status == expected, f'{path}: esperado {expected}, recebido {status}: {raw[:500]}'
                assert 'application/json' in h.get('Content-Type','') and 'no-store' in h.get('Cache-Control',''), f'Headers: {path}'
                body = json.loads(raw)
                assert set(body) == ({'success','data'} if expected == 200 else {'success','error'}), f'Envelope {path}'
                assert body['success'] == (expected == 200)
                if expected >= 400:
                    assert set(body['error']) == ({'code','message'} if expected in (429,503) else {'code','message','details'}), body
                    assert not any(secret in raw for secret in private)
                return body.get('data',body), h

            def report(b, kind, date=ref, expected=200, extra=''):
                path='/api/admin/pontos/'+kind
                if date is not None:
                    path += '?'+urllib.parse.urlencode({'data':str(date)})
                if extra:
                    path += ('&' if '?' in path else '?')+extra
                return api(b,path,expected)[0]

            def summary(actual,total,present):
                assert actual == dict(total_funcionarios=total,total_ativos=total,presentes=present,ausentes=total-present,taxa_presenca_percent=round(100*present/total) if total else 0), actual

            def scenario(group, action):
                nonlocal current
                if selected is not None and group not in selected:
                    return
                current=group
                clear()
                try:
                    action()
                except Exception as failure:
                    results.append(('FALHOU',group,safe(str(failure))))
                    print('FALHOU '+group+': '+safe(str(failure)),flush=True)

            def contracts():
                b=login(1)
                for kind,fields in [('hoje',{'data_referencia','resumo','presentes','ausentes'}),('relatorio',{'data_referencia','resumo','items'}),('resumo',{'data_referencia','resumo'})]:
                    data=report(b,kind)
                    assert set(data)==fields
                    summary(data['resumo'],3 if kind=='resumo' else 2,1)
                    if kind!='resumo':
                        rows=data['items'] if kind=='relatorio' else data['presentes']+data['ausentes']
                        assert len(rows)==2
                        for row in rows:
                            assert set(row)=={'id','vinculo_funcional_id','unidade_escolar_id','unidade_escolar_nome','funcionario','status','total_batidas','entrada','saida','registros'}
                            assert row['unidade_escolar_id']==1 and set(row['funcionario'])=={'id','nome','email','cpf','ativo','cargo_id'}
                            assert row['funcionario']['cpf'].startswith('***.***.***-')
                            for punch in row['registros']:
                                assert set(punch)=={'id','tipo','sequencia','registrado_em'} and punch['registrado_em'].startswith(str(ref)+' ')
                        assert rows[0]['status']=='COMPLETO' and rows[0]['total_batidas']==4 and rows[1]['entrada']=={} and rows[1]['saida']=={}
                    check(True,kind+': contrato exato e contagens por pessoa/vinculo')
                week=report(b,'relatorio/semanal')
                assert set(week)=={'data_referencia','data_inicio','data_fim','data_atual','resumo','dias'} and len(week['dias'])==7
                assert week['data_inicio']==str(ref) and week['data_fim']==str(end) and week['data_atual']==str(today)
                assert week['resumo']==dict(total_previstos=20,total_presencas=2,total_ausencias=18,taxa_presenca_percent=10),week
                for i,day in enumerate(week['dias']):
                    assert set(day)=={'data','futuro','resumo'} and day['data']==str(ref+dt.timedelta(days=i)) and not day['futuro']
                    summary(day['resumo'],2 if i==0 else 3,1 if i<2 else 0)
                check(True,'semanal: sete dias, vigencia historica e totais pessoa-dia')
                hierarchy=report(b,'relatorio/hierarquia')
                assert set(hierarchy)=={'data_referencia','resumo','diretorias'}
                assert hierarchy['resumo']==dict(total_funcionarios=2,total_ativos=2,presentes=1,ausentes=1,taxa_presenca_percent=50,total_vinculos=2,total_escolas=1,total_diretorias=1),hierarchy
                for department in hierarchy['diretorias']:
                    assert set(department)=={'diretoria_ensino_id','diretoria_ensino_nome','resumo','escolas'}
                    for school in department['escolas']:
                        assert set(school)=={'unidade_escolar_id','unidade_escolar_nome','resumo'}
                assert 'cpf' not in json.dumps(hierarchy) and 'email' not in json.dumps(hierarchy)
                check(True,'hierarquia: somente agregados; sem dados nominais extras')
                me,_=api(b,PATHS[-1])
                assert set(me)=={'admin','capacidades'} and set(me['admin'])=={'authProvider','id','sub','name','nome','email','loginAt'}
                assert me['admin']['id']==1 and me['admin']['name']==me['admin']['nome']=='Fixture admin 1' and me['admin']['authProvider']=='govbr'
                assert me['admin']['sub']=='fictional-1' and me['admin']['loginAt'].endswith('Z') and isinstance(me['capacidades'],list)
                check(True,'auth/me: identidade e capacidades sem campos extras')
                for path in PATHS:
                    api(b,path+'/')
                plain=report(b,'relatorio')
                paged=report(b,'relatorio',extra='page=2&limit=1&data_inicio=1999-01-01&data_fim=1999-01-02')
                assert plain==paged and 'pagination' not in paged
                check(True,'barra final aceita; paginacao e intervalo nao aplicaveis, ignorados como no Express')

            def dates():
                b=login(1)
                for kind in ('hoje','relatorio','relatorio/semanal','relatorio/hierarquia'):
                    clear()
                    for bad in ('invalid','2026-02-30','2025-02-29','2026-13-01','2026-00-01','2026-01-00','2026-1-01',' ','10000-01-01'):
                        report(b,kind,bad,400)
                    for extra in ('data=2026-01-01&data=2026-01-02','data%5Bx%5D=a'):
                        report(b,kind,None,400,extra)
                    report(b,kind,'2024-02-29')
                    result=report(b,kind,None)
                    assert result['data_referencia']==str(today)
                    check(True,kind+': invalidas 400, bissexto e padrao Sao Paulo com JVM UTC')
                clear()
                for date in ('1000-01-01','9999-12-31','0000-01-01','0999-12-31'):
                    report(b,'relatorio/semanal',date,400)
                for date in ('1000-01-06','9999-12-20'):
                    assert len(report(b,'relatorio/semanal',date)['dias'])==7
                week=report(b,'relatorio/semanal',today+dt.timedelta(days=30))
                assert all(d['futuro'] and d['resumo']['total_funcionarios']==0 for d in week['dias']) and week['resumo']['total_previstos']==0
                assert report(b,'resumo','invalid')['data_referencia']==str(today)
                check(True,'limites semanais 1000..9999, semana futura zerada, resumo ignora data')
                # Dias historicos sem vigencia nao trazem funcionarios atuais.
                assert report(b,'hoje',ref-dt.timedelta(days=11))['resumo']['total_funcionarios']==0
                old=report(b,'hoje',ref-dt.timedelta(days=1))
                assert old['resumo']['total_funcionarios']==3 and any(row['funcionario']['id']==5 and not row['funcionario']['ativo'] for row in old['ausentes'])
                check(True,'fronteiras de vigencia e funcionario hoje inativo preservado no historico')

            def territory():
                for account,schools,total,present in ((1,{1},2,1),(3,{1,3},3,1),(4,{2},1,1),(5,{1},2,1),(6,{1},2,1),(7,{1},2,1),(9,{1},2,1),(13,{3},2,1)):
                    clear(); b=login(account)
                    data=report(b,'hoje',extra='escopo_global=true&unidades_escolares_ids=2&adminId=2&perfil=ADMIN_SEDUC')
                    assert {row['unidade_escolar_id'] for row in data['presentes']+data['ausentes']}<=schools
                    summary(data['resumo'],total,present)
                    data=report(b,'relatorio',extra='unidade_escolar_id=2&diretoria_ensino_id=2')
                    assert {row['unidade_escolar_id'] for row in data['items']}<=schools
                    if account != 9:
                        report(b,'relatorio/hierarquia',expected=403,extra='unidade_escolar_id='+('1' if account==4 else '2'))
                        report(b,'relatorio/hierarquia',expected=403,extra='diretoria_ensino_id='+('1' if account==4 else '2'))
                    me,_=api(b,PATHS[-1])
                    caps=set(me['capacidades'])
                    assert {'ponto.hoje.visualizar','ponto.resumo.visualizar','relatorio.visualizar','relatorio.hierarquico.visualizar'} <= caps
                    assert ('funcionario.editar' in caps) == (account != 7)
                    assert ('qr.gerar' in caps) == (account not in (3,4,7))
                    check(True,f'perfil {account}: capacidades, escopo servidor e filtros forjados sem vazamento')
                clear(); seduc=login(2)
                for kind in ('hoje','relatorio'):
                    report(seduc,kind,expected=403)
                me,_=api(seduc,PATHS[-1])
                assert not {'ponto.hoje.visualizar','relatorio.visualizar','funcionario.visualizar','qr.gerar'} & set(me['capacidades'])
                assert {'ponto.resumo.visualizar','relatorio.hierarquico.visualizar'} <= set(me['capacidades'])
                aggregate=report(seduc,'relatorio/hierarquia')
                assert aggregate['resumo']['total_funcionarios']==4 and aggregate['resumo']['presentes']==2 and aggregate['resumo']['total_vinculos']==5
                assert {s['unidade_escolar_id'] for d in aggregate['diretorias'] for s in d['escolas']}=={1,2,3}
                filtered=report(seduc,'relatorio/hierarquia',extra='unidade_escolar_id=2&diretoria_ensino_id=2')
                assert filtered['resumo']['total_funcionarios']==1
                report(seduc,'relatorio/hierarquia',expected=403,extra='unidade_escolar_id=99999')
                check(True,'SEDUC: globais apenas agregados, filtros validos e inexistente 403')
                clear(); mixed=login(9)
                assert report(mixed,'resumo')['resumo']['total_funcionarios']==5
                assert report(mixed,'hoje')['resumo']['total_funcionarios']==2
                check(True,'SEDUC + escola: nominal local, resumo global')
                clear(); empty=login(8)
                for kind in ('hoje','relatorio','resumo','relatorio/semanal','relatorio/hierarquia'):
                    data=report(empty,kind)
                    assert data['resumo'].get('total_funcionarios',data['resumo'].get('total_previstos'))==0
                report(empty,'relatorio/hierarquia',expected=403,extra='unidade_escolar_id=1')
                check(True,'DRE vazia: resultados vazios, nunca acesso global')
                clear(); b=login(1)
                for name in ('unidade_escolar_id','diretoria_ensino_id'):
                    for value in ('0','-1','01','1.0','1 OR 1=1','9007199254740992','999999999999999999999'):
                        report(b,'relatorio/hierarquia',expected=400,extra=urllib.parse.urlencode({name:value}))
                    report(b,'relatorio/hierarquia',expected=400,extra=name+'=1&'+name+'=2')
                report(b,'relatorio/hierarquia',expected=400,extra='unidade_escolar_id%5Bx%5D=1')
                check(True,'IDs territoriais invalidos/duplicados/injecao rejeitados com 400')

            def sessions():
                for path in PATHS:
                    api(Browser(),path,401,{'X-Admin-Id':'2','Authorization':'Bearer forged'})
                check(True,'todos os GETs exigem sessao; headers/identidade do navegador nao autorizam')
                b=login(10)
                before=api(b,PATHS[-1])[0]
                sql("UPDATE usuarios_administrativos SET nome='Changed fixture',email='changed@example.invalid' WHERE id=10")
                assert api(b,PATHS[-1])[0]['admin']==before['admin']
                check(True,'auth/me preserva snapshot de identidade e loginAt')
                sql("UPDATE acessos_administrativos SET perfil='COORDENADOR' WHERE usuario_administrativo_id=10")
                assert 'funcionario.editar' not in api(b,PATHS[-1])[0]['capacidades']
                check(True,'capacidades recalculadas apos mudanca de perfil')
                sql("UPDATE acessos_administrativos SET status='REVOGADO' WHERE usuario_administrativo_id=10")
                for path in PATHS:
                    api(b,path,403)
                check(True,'acesso revogado bloqueia todos os GETs na proxima requisicao')
                b=login(11)
                sql('UPDATE usuarios_administrativos SET ativo=0 WHERE id=11')
                for path in PATHS:
                    api(b,path,403)
                check(True,'cadastro inativo bloqueia todos os GETs')
                # Invalida vigencia apos login, sem remover a sessao.
                b=login(12)
                sql("UPDATE acessos_administrativos SET data_fim=CURRENT_DATE - INTERVAL 1 DAY,data_inicio=CURRENT_DATE - INTERVAL 2 DAY WHERE usuario_administrativo_id=12")
                api(b,PATHS[-1],403)
                check(True,'vigencia expirada apos login bloqueada')

            def audits():
                b=login(1)
                offset=log_path.stat().st_size
                for kind in ('hoje','resumo','relatorio/semanal'):
                    report(b,kind)
                api(b,PATHS[-1])
                time.sleep(.15)
                assert 'evento=relatorio_consultado' not in log_path.read_text()[offset:]
                report(b,'relatorio')
                report(b,'relatorio/hierarquia',extra='diretoria_ensino_id=1&unidade_escolar_id=1')
                report(b,'relatorio',date='invalid',expected=400)
                report(b,'relatorio/hierarquia',expected=403,extra='unidade_escolar_id=2')
                time.sleep(.15)
                events=[line for line in log_path.read_text()[offset:].splitlines() if 'evento=relatorio_consultado' in line]
                assert len(events)==2 and all('adminId=1' in line and 'ipOrigem=127.0.0.1' in line and 'data_referencia='+str(ref) in line for line in events),events
                assert 'diretoria_ensino_id=1' in events[1] and 'unidade_escolar_id=1' in events[1]
                check(True,'somente diario/hierarquia bem-sucedidos auditados; identidade/IP/filtros corretos')
                assert not any(secret in log_path.read_text() for secret in private)
                check(True,'logs sem chaves, credenciais ou tokens de homologacao')

            def internal():
                b=login(1)
                body=json.dumps(dict(data=str(ref),escopo_global=False,unidades_escolares_ids=[1]),separators=(',',':')).encode()
                path='/internal/relatorios/diario'
                def signed(payload=body,target=path,timestamp=None,request_id=None):
                    stamp=str(int(time.time()) if timestamp is None else timestamp); rid=request_id or str(uuid.uuid4())
                    canonical='\n'.join(('POST',target,stamp,rid,hashlib.sha256(payload).hexdigest()))
                    return {'Content-Type':'application/json','X-Internal-Timestamp':stamp,'X-Internal-Request-Id':rid,'X-Internal-Signature':hmac.new(key.encode(),canonical.encode(),hashlib.sha256).hexdigest()}
                assert b.request(app+path,'POST',body,{'Content-Type':'application/json'})[0]==401
                headers=signed()
                assert b.request(app+path,'POST',body,headers)[0]==200
                assert b.request(app+path,'POST',body,headers)[0]==401
                assert b.request(app+path,'POST',body+b' ',signed())[0]==401
                assert b.request(app+path+'?x=1','POST',body,signed())[0]==401
                for offset in (-121,121):
                    assert b.request(app+path,'POST',body,signed(timestamp=int(time.time())+offset))[0]==401
                assert b.request(app+path,'POST',body,signed(request_id='invalid'))[0]==401
                headers=signed(); headers['X-Internal-Signature']='0'*64
                assert b.request(app+path,'POST',body,headers)[0]==401
                for route in ('semanal','hierarquia'):
                    assert b.request(app+'/internal/relatorios/'+route,'POST',body)[0]==401
                check(True,'HMAC: assinatura valida aceita; cookie, replay, corpo/URL alterados, relogio e ID invalidos rejeitados')

            def limits():
                b=login(1)
                def digest(subject):
                    return hmac.new(session_secret.encode(),json.dumps(['rate-limit-v1',subject],separators=(',',':')).encode(),hashlib.sha256).hexdigest()
                sensitive='reports-check:ponto:rate_limit:sensitive:'+digest('admin:1')
                resource='reports-check:ponto:rate_limit:sensitive-resource:'+digest(['admin:1','/api/admin/pontos','/hoje',''])
                # 40 sucessos reais; limites nao contam auth/me.
                for i in range(40):
                    _, headers=api(b,PATHS[0])
                    assert 'sensitive' in str(headers) and 'w=900' in str(headers)
                _, headers=api(b,PATHS[0],429)
                assert int(headers['Retry-After'])>0
                assert run('docker','exec',redis,'redis-cli','HGET',sensitive,'hits')=='41'
                assert run('docker','exec',redis,'redis-cli','HGET',resource,'hits')=='40'
                api(b,PATHS[-1])
                status, _, raw = b.request(app+'/api/admin/qr-tokens', 'POST', b'{}',
                    {'Origin':app, 'Content-Type':'application/json'})
                assert status==429 and json.loads(raw)['error']['code']=='RATE_LIMITED'
                check(True,'cota sensivel consumida por relatorios tambem bloqueia POST QR da API integrada')
                check(True,'40 sucessos, 41a retorna 429/Retry-After; chaves/TTL Redis compativeis; me fora da cota')
                clear()
                run('docker','exec',redis,'redis-cli','HSET',resource,'hits','40')
                run('docker','exec',redis,'redis-cli','PEXPIRE',resource,'900000')
                api(b,PATHS[0],429)
                check(True,'cota por recurso preexistente em Redis respeitada')
                clear()
                ip_key='reports-check:ponto:rate_limit:ip-abuse:'+digest('127.0.0.1')
                run('docker','exec',redis,'redis-cli','HSET',ip_key,'hits','2000')
                run('docker','exec',redis,'redis-cli','PEXPIRE',ip_key,'900000')
                api(b,PATHS[0],429)
                check(True,'cota IP compartilhada preexistente respeitada')
                clear()
                # Pausa somente o Redis descartavel; finally garante despausa antes de remover.
                run('docker','pause',redis)
                try:
                    body,_=api(b,PATHS[0],503)
                    assert body['error']['code']=='RATE_LIMIT_UNAVAILABLE'
                finally:
                    run('docker','unpause',redis)
                clear(); api(b,PATHS[0])
                check(True,'Redis indisponivel retorna 503 sem fallback; recuperacao retorna 200')

            scenario('contratos',contracts)
            scenario('datas',dates)
            scenario('territorio',territory)
            scenario('sessao',sessions)
            scenario('auditoria',audits)
            scenario('hmac',internal)
            scenario('limites',limits)
            if selected is None or 'sessao' in selected:
                current='sessao'
                try:
                    spring.terminate(); spring.wait(timeout=15)
                    clear(); spring=start(ttl=3)
                    b=login(1); sid=b.sid(); private.append(sid)
                    api(b,PATHS[-1])
                    time.sleep(3.3)
                    for path in PATHS:
                        api(Browser(),path,401,{'Cookie':'ATESTA_ADMIN_SESSION='+sid})
                    check(True,'expiracao absoluta: replay do cookie expirado rejeitado nos seis GETs')
                except Exception as failure:
                    results.append(('FALHOU','sessao',safe(str(failure))))
            assert not any(value in log_path.read_text() for value in private), 'Segredo nos logs'
        except Exception as failure:
            results.append(('BLOQUEADO',current,safe(str(failure))))
            print('BLOQUEADO '+current+': '+safe(str(failure)),flush=True)
            if (folder/'spring.log').exists():
                print(safe('\n'.join((folder/'spring.log').read_text().splitlines()[-25:])),flush=True)
        finally:
            for process in reversed(processes):
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        process.kill(); process.wait()
            server.shutdown(); server.server_close()
            for name in reversed(created):
                run('docker','rm','-f',name)
            assert baseline==run(*SNAPSHOT), 'mysql-dev/node-dev alterados'
            assert all(p.exists() and hashlib.sha256(p.read_bytes()).digest()==digest for p,digest in protected.items()), '.env alterado'
            current='limpeza'; check(True,'somente recursos temporarios removidos; mysql-dev, node-dev e .env preservados')
            stamp=dt.datetime.now(ZoneInfo('America/Sao_Paulo')).isoformat(timespec='seconds')
            overall='BLOQUEADO' if any(s=='BLOQUEADO' for s,_,_ in results) else 'FALHOU' if any(s=='FALHOU' for s,_,_ in results) else 'PASSOU'
            section=f'\n## Rodada {stamp}: {overall}\n\nGrupos: {args.only or "todos"}. Requisicoes publicas verificadas: {requests}.\n\n'
            section+='\n'.join(f'- **{status}** `{group}`: {description}' for status,group,description in results)+'\n'
            if not REPORT.exists():
                REPORT.write_text('# Homologação de relatórios, dashboard e sessão\n\nHTTP direto no Spring, Java 21, MySQL 8.4/Redis 7 descartáveis, Gov.br Python simulado e dados fictícios. Sem Express, sem carregar `.env`. O histórico abaixo preserva falhas e reexecuções por grupo.\n')
            with REPORT.open('a') as report_file:
                report_file.write(section)
            print(overall+f': {len(results)} verificacoes; {requests} requisicoes publicas. Relatorio: '+str(REPORT),flush=True)
    return 0 if overall=='PASSOU' else 1


if __name__=='__main__':
    sys.exit(main())
