"""核对全量导入清单、每表行数、schema 边界及实际大屏接口。"""
import json
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from psycopg import sql

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'runtime/full-source-import.json').read_text(encoding='utf-8'))
assert not report['failures'] and len(report['tables']) == 238
assert report['systemTablesUnchanged']
config = dict(l.split('=', 1) for l in (root / '.env.local').read_text().splitlines()
              if l and not l.startswith('#') and '=' in l)
url = urlparse(config['SOURCE_DB_URL'].removeprefix('jdbc:'))
assert url.path == '/bridgemind_test' and config['SOURCE_DB_SCHEMA'] == 'qiaoliang'
with psycopg.connect(host=url.hostname, port=url.port, dbname='bridgemind_test',
                      user=config['SOURCE_DB_USER'], password=config['SOURCE_DB_PASSWORD'],
                      options='-c default_transaction_read_only=on', connect_timeout=10) as db:
    tables = {r[0] for r in db.execute("SELECT tablename FROM pg_tables WHERE schemaname='qiaoliang'")}
    assert tables == set(report['tables'])
    query = sql.SQL(' UNION ALL ').join(sql.SQL('SELECT {} AS name,count(*) FROM {}').format(
        sql.Literal(table), sql.Identifier('qiaoliang', table)) for table in sorted(tables))
    counts = dict(db.execute(query).fetchall())
    assert all(counts[t] == report['tables'][t]['rows'] for t in tables)
    system = db.execute("SELECT tablename FROM pg_tables WHERE schemaname='bridgemind_test' ORDER BY tablename").fetchall()
    assert system == [('bm_user',), ('flyway_schema_history',)]
    print(f'PASS: {len(tables)} source tables, {sum(counts.values())} rows; system schema still has 2 tables.')
base = config.get('BACKEND_URL', 'http://localhost:8088') + '/api/v1/'
for path in ['dashboard', 'bridges?page=1&size=8', 'bridges/QXQR001A/monitoring/points',
             'bridges/QXQR001A/reports', 'alarms']:
    with urllib.request.urlopen(base + path, timeout=40) as response:
        payload = json.load(response)
        assert payload['code'] == 'OK'
        if path == 'dashboard':
            assert payload['data']['total'] == 14372
    print(f'PASS: {path}')
