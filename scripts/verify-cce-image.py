"""Isolated container smoke test. Never uses production/local database credentials."""
import http.cookiejar
import http.server
import json
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
IMAGE = sys.argv[1] if len(sys.argv) > 1 else 'bridgemind:20261028-cce-manualsql-p18089'
suffix = uuid.uuid4().hex[:10]
network, database, app = [f'bridgemind-cce-{kind}-{suffix}' for kind in ('net', 'db', 'app')]
calls = []


def docker(*args, check=True):
    result = subprocess.run(['docker', *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and result.returncode:
        raise RuntimeError(result.stderr[-3000:])
    return result.stdout.strip()


class DifyStub(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        calls.append((self.headers.get('Authorization'), body['response_mode']))
        assert self.path == '/v1/chat-messages'
        assert 'bridge_context' in body['inputs']
        self.send_response(200)
        if body['response_mode'] == 'blocking':
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            plan = dict(route='greeting_help' if body['query'] == 'hello' else 'business_query', topic='defects')
            self.wfile.write(json.dumps({'answer': json.dumps(plan)}).encode())
        else:
            assert '合成' in body['inputs']['bridge_context']
            self.send_header('Content-Type', 'text/event-stream')
            self.end_headers()
            for token in ('合成测试：', '病害1条。'):
                self.wfile.write(('data: ' + json.dumps({'event': 'message', 'answer': token}) + '\n\n').encode())
                self.wfile.flush()
                time.sleep(0.15)
            self.wfile.write(b'data: {"event":"message_end"}\n\n')
            self.wfile.flush()


stub = http.server.ThreadingHTTPServer(('0.0.0.0', 0), DifyStub)
threading.Thread(target=stub.serve_forever, daemon=True).start()
password = secrets.token_hex(16)
env_path = ROOT / 'runtime' / f'cce-smoke-{suffix}.env'
evidence = {}
try:
    docker('network', 'create', network)
    docker('run', '-d', '--name', database, '--network', network,
           '-e', 'POSTGRES_DB=cce_smoke', '-e', f'POSTGRES_PASSWORD={password}', 'postgres:15-alpine')
    for _ in range(60):
        if 'accepting connections' in docker('exec', database, 'pg_isready', '-U', 'postgres', check=False):
            break
        time.sleep(1)
    docker('exec', database, 'psql', '-U', 'postgres', '-d', 'cce_smoke', '-v', 'ON_ERROR_STOP=1',
           '-c', 'CREATE SCHEMA qiaoliang;')
    sql = (ROOT / 'deploy/cce/sql/01_create_bridge_agent.sql').read_text(encoding='utf-8')
    def sql_exec(sql):
        result = subprocess.run(['docker', 'exec', '-i', database, 'psql', '-U', 'postgres', '-d', 'cce_smoke', '-v', 'ON_ERROR_STOP=1'],
                                input=sql, capture_output=True, text=True, encoding='utf-8')
        if result.returncode:
            raise RuntimeError(result.stderr)
        return result.stdout
    sql_exec(sql)
    sql_exec("INSERT INTO bridge_agent.bm_structure_config VALUES ('manual-sentinel',0,'test','smoke',now());")
    sql_exec(sql)
    assert docker('exec', database, 'psql', '-U', 'postgres', '-d', 'cce_smoke', '-tAc',
                  "SELECT count(*) FROM bridge_agent.bm_structure_config WHERE bridge_id='manual-sentinel'") == '1'
    sql_exec("DELETE FROM bridge_agent.bm_structure_config WHERE bridge_id='manual-sentinel';")
    sql_exec("""BEGIN;
        INSERT INTO bridge_agent.bm_user(username,password_hash,display_name) VALUES ('smoke','unused','smoke');
        INSERT INTO bridge_agent.bm_structure_config VALUES ('smoke',0,'test','smoke',now());
        INSERT INTO bridge_agent.bm_structure_part VALUES ('smoke','p','桥面系','part','','',0);
        INSERT INTO bridge_agent.bm_structure_binding VALUES ('smoke','p',0,'point','device',NULL);
        DELETE FROM bridge_agent.bm_structure_part WHERE bridge_id='smoke';
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM bridge_agent.bm_structure_binding WHERE bridge_id='smoke')
        THEN RAISE EXCEPTION 'Cascade failed'; END IF; END $$;
        ROLLBACK;
    """)
    env_path.write_text('\n'.join([
        'SPRING_PROFILES_ACTIVE=prod,cce',
        f'APP_DB_URL=jdbc:postgresql://{database}:5432/cce_smoke?currentSchema=bridge_agent',
        'APP_DB_USER=postgres', f'APP_DB_PASSWORD={password}', 'APP_DB_SCHEMA=bridge_agent',
        f'SOURCE_DB_URL=jdbc:postgresql://{database}:5432/cce_smoke?currentSchema=qiaoliang',
        'SOURCE_DB_USER=postgres', f'SOURCE_DB_PASSWORD={password}', 'SOURCE_DB_SCHEMA=qiaoliang',
        f'DIFY_BASE_URL=http://host.docker.internal:{stub.server_port}/v1',
        'DIFY_API_KEY=smoke-answer', 'DIFY_CLASSIFIER_API_KEY=smoke-classifier',
        'DIFY_DATA_MODE=demo', 'SESSION_COOKIE_SECURE=false',
    ]) + '\n', encoding='utf-8')
    docker('run', '-d', '--name', app, '--network', network, '--env-file', str(env_path),
           '-p', '127.0.0.1::18089', '--memory', '2g', '--cpus', '2', IMAGE)
    port = docker('port', app, '18089/tcp').rsplit(':', 1)[1]
    base = f'http://127.0.0.1:{port}'
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def get(path):
        with client.open(base + path, timeout=15) as response:
            return response.read().decode()

    def ready():
        for _ in range(90):
            try:
                if json.loads(get('/health/ready'))['status'] == 'UP':
                    return
            except (OSError, ValueError):
                pass
            if docker('inspect', '-f', '{{.State.Running}}', app) == 'false':
                raise RuntimeError(docker('logs', app, check=False)[-4000:])
            time.sleep(1)
        raise RuntimeError('Container readiness timeout')

    ready()
    assert json.loads(get('/health/live'))['status'] == 'UP'
    assert '<div id="root">' in get('/screen')
    assert '<div id="root">' in get('/bridges/DEMO')
    assert json.loads(get('/api/v1/auth/config'))['data']['previewEnabled'] is True
    assert json.loads(get('/api/v1/agent/status'))['data']['configured'] is True
    assert docker('exec', database, 'psql', '-U', 'postgres', '-d', 'cce_smoke', '-tAc',
                  'SELECT count(*) FROM bridge_agent.bm_user') == '0'
    assert docker('exec', database, 'psql', '-U', 'postgres', '-d', 'cce_smoke', '-tAc',
                  "SELECT count(*) FROM information_schema.tables WHERE table_schema='bridge_agent' AND table_name='flyway_schema_history'") == '0'
    assert 'flyway' not in docker('logs', app).lower()
    evidence['startup'] = 'prod,cce, anonymous, ready, SPA routing, zero login accounts; no Flyway startup/history'
    evidence['manual_sql'] = 'initial import, repeated import preserves records, generated user ID, foreign-key cascade, rollback'
    body = {'question': 'hello', 'scope': 'network', 'pageFilters': {}}
    try:
        client.open(urllib.request.Request(base + '/api/v1/agent/ask', data=json.dumps(body).encode(),
                                          headers={'Content-Type': 'application/json'}), timeout=10)
        raise AssertionError('Missing CSRF unexpectedly accepted')
    except urllib.error.HTTPError as error:
        assert error.code == 403
    csrf = json.loads(get('/api/v1/auth/csrf'))['data']

    def ask(body):
        req = urllib.request.Request(base + '/api/v1/agent/ask', data=json.dumps(body).encode(),
                                     headers={'Content-Type': 'application/json', csrf['headerName']: csrf['token']})
        with client.open(req, timeout=30) as response:
            assert 'text/event-stream' in response.headers.get('Content-Type')
            event, events = '', []
            for raw in response:
                line = raw.decode().strip()
                if line.startswith('event:'):
                    event = line[6:].strip()
                elif line.startswith('data:'):
                    events.append((event, json.loads(line[5:])))
            assert any(e == 'done' for e, _ in events), events
            assert not any(e == 'error' for e, _ in events), events
            return events

    greeting = ask(body)
    assert not any(e == 'evidence' for e, _ in greeting)
    assert calls == [('Bearer smoke-classifier', 'blocking')]
    business = ask({'question': 'summarize defects', 'scope': 'bridge', 'bridgeId': 'DEMO', 'pageFilters': {}})
    assert any(e == 'evidence' for e, _ in business)
    assert len([e for e, _ in business if e == 'delta']) >= 2
    assert calls[-2:] == [('Bearer smoke-classifier', 'blocking'), ('Bearer smoke-answer', 'streaming')]
    evidence['api'] = 'CSRF enforced; distinct classifier/answer keys; demo evidence; SSE chunks and done'
    # Simulate a failed web server: the supervisor must also stop Java and exit nonzero.
    docker('exec', app, 'sh', '-c', 'kill -TERM $(cat /tmp/nginx.pid)')
    for _ in range(30):
        if docker('inspect', '-f', '{{.State.Running}}', app) == 'false':
            break
        time.sleep(1)
    assert docker('inspect', '-f', '{{.State.Running}}', app) == 'false'
    assert docker('inspect', '-f', '{{.State.ExitCode}}', app) != '0'
    docker('start', app)
    port = docker('port', app, '18089/tcp').rsplit(':', 1)[1]
    base = f'http://127.0.0.1:{port}'
    ready()
    docker('stop', '--time', '30', app)
    assert docker('inspect', '-f', '{{.State.ExitCode}}', app) == '0'
    evidence['lifecycle'] = 'service failure exits container; restart works; SIGTERM exits 0'
    evidence['image'] = IMAGE
    evidence['limits'] = 'Isolated PostgreSQL 15 and Dify stub only; no production connectivity/model verification'
    (ROOT / 'runtime' / 'cce-image-verification.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    print(json.dumps(evidence, indent=2), flush=True)
finally:
    docker('rm', '-f', app, database, check=False)
    docker('network', 'rm', network, check=False)
    env_path.unlink(missing_ok=True)
    stub.shutdown()
