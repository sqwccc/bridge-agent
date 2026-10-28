"""将已导入的来源表原地移入 qiaoliang；不复制、覆盖或删除数据。"""
import json
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from psycopg import sql

root = Path(__file__).resolve().parents[1]
config = dict(line.split('=', 1) for line in
              (root / '.env.local').read_text(encoding='utf-8').splitlines()
              if line and not line.startswith('#') and '=' in line)
url = urlparse(config['APP_DB_URL'].removeprefix('jdbc:'))
assert url.path == '/bridgemind_test' and config['APP_DB_SCHEMA'] == 'bridgemind_test'
tables = sorted(json.loads((root / 'runtime/remote-source-import.json').read_text()))
assert len(tables) == 13 and 'bm_user' not in tables and 'flyway_schema_history' not in tables
report = {}
with psycopg.connect(host=url.hostname, port=url.port, dbname='bridgemind_test',
                      user=config['APP_DB_USER'], password=config['APP_DB_PASSWORD'],
                      connect_timeout=10) as conn:
    conn.execute("SET LOCAL lock_timeout='10s'")
    if conn.execute("SELECT 1 FROM pg_namespace WHERE nspname='qiaoliang'").fetchone():
        raise RuntimeError('目标 schema 已存在，拒绝修改已有来源对象')
    conn.execute(sql.SQL('LOCK TABLE {} IN ACCESS EXCLUSIVE MODE').format(
        sql.SQL(',').join(sql.Identifier('bridgemind_test', t) for t in tables)))
    before = conn.execute("""SELECT c.oid,c.relname,c.relkind FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace=n.oid
        WHERE n.nspname='bridgemind_test' ORDER BY c.oid""").fetchall()
    conn.execute('CREATE SCHEMA qiaoliang AUTHORIZATION CURRENT_USER')
    for table in tables:
        old = sql.Identifier('bridgemind_test', table)
        new = sql.Identifier('qiaoliang', table)
        oid = conn.execute('SELECT %s::regclass::oid', (f'bridgemind_test.{table}',)).fetchone()[0]
        count = conn.execute(sql.SQL('SELECT count(*) FROM {}').format(old)).fetchone()[0]
        conn.execute(sql.SQL('ALTER TABLE {} SET SCHEMA qiaoliang').format(old))
        assert conn.execute('SELECT %s::regclass::oid', (f'qiaoliang.{table}',)).fetchone()[0] == oid
        assert conn.execute(sql.SQL('SELECT count(*) FROM {}').format(new)).fetchone()[0] == count
        report[table] = {'rows': count, 'oidPreserved': True}
        print(f'{table}: {count} rows, original table preserved', flush=True)
    after = conn.execute("""SELECT c.oid,c.relname,c.relkind FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace=n.oid
        WHERE n.nspname IN ('bridgemind_test','qiaoliang') ORDER BY c.oid""").fetchall()
    assert before == after, '表、索引或序列对象发生意外变化，回滚'
    remaining = conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='bridgemind_test' ORDER BY tablename").fetchall()
    assert remaining == [('bm_user',), ('flyway_schema_history',)]
(root / 'runtime/source-schema-separation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('COMMITTED: 13 source tables in qiaoliang; 2 system tables in bridgemind_test.')
