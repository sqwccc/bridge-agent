"""将项目 schema 完整迁入独立测试数据库；不清理原库或覆盖目标对象。"""
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from psycopg import sql

root = Path(__file__).resolve().parents[1]
config = dict(line.split('=', 1) for line in
              (root / '.env.local').read_text(encoding='utf-8').splitlines()
              if line and not line.startswith('#') and '=' in line)
url = urlparse(config['APP_DB_URL'].removeprefix('jdbc:'))
schema = 'bridgemind_test'
destination = 'bridgemind_test'
if url.path != '/bid_agent' or config['APP_DB_SCHEMA'] != schema:
    raise RuntimeError('此一次性迁移仅支持 bid_agent.bridgemind_test → bridgemind_test 数据库')
args = dict(host=url.hostname, port=url.port, user=config['APP_DB_USER'],
            password=config['APP_DB_PASSWORD'], connect_timeout=10)
with psycopg.connect(dbname=destination, **args) as target:
    if target.execute("SELECT 1 FROM pg_namespace WHERE nspname=%s", (schema,)).fetchone():
        raise RuntimeError('目标 schema 已存在，拒绝覆盖')
env = dict(os.environ, PGPASSWORD=config['APP_DB_PASSWORD'])
dump = '/tmp/bridgemind-db-transfer-20261023.dump'
base = ['docker', 'exec', '-e', 'PGPASSWORD', 'shared_postgres']
connection = ['-h', url.hostname, '-p', str(url.port), '-U', config['APP_DB_USER']]
def run(command):
    subprocess.run(command, env=env, check=True)
run(base + ['pg_dump'] + connection + ['-d', 'bid_agent', '-n', schema,
    '--no-owner', '--no-acl', '-Fc', '-f', dump])
run(['docker', 'cp', 'shared_postgres:' + dump, str(root / 'runtime/test-database-transfer.dump')])
# 本机客户端为 PG18，远程为 PG16；只移除 PG17 起新增的会话参数。
restored = subprocess.run(base + ['pg_restore', '--no-owner', '--no-acl',
    '--file=-', dump], env=env, check=True, stdout=subprocess.PIPE).stdout
restored = restored.replace(b'SET transaction_timeout = 0;\n', b'')
subprocess.run(['docker', 'exec', '-i', '-e', 'PGPASSWORD', 'shared_postgres',
    'psql'] + connection + ['-d', destination, '-X', '--single-transaction',
    '-v', 'ON_ERROR_STOP=1', '-f', '-'], env=env, input=restored,
    stdout=subprocess.DEVNULL, check=True)
print('Restored project schema to independent bridgemind_test database.', flush=True)
report = {}
with psycopg.connect(dbname='bid_agent', **args) as source, psycopg.connect(dbname=destination, **args) as target:
    tables = source.execute('SELECT tablename FROM pg_tables WHERE schemaname=%s ORDER BY tablename', (schema,)).fetchall()
    for (table,) in tables:
        # 排序后的行摘要不依赖物理存储顺序；账号摘要不输出到报告。
        query = sql.SQL('SELECT md5(row_to_json(t)::text) FROM {} t ORDER BY 1').format(sql.Identifier(schema, table))
        original = source.execute(query).fetchall()
        copied = target.execute(query).fetchall()
        if original != copied:
            raise RuntimeError(f'{table}: 内容校验失败，配置未切换')
        report[table] = {'rows': len(copied), 'verified': True}
        print(f'{table}: {len(copied)} rows verified', flush=True)
    for query in [
        'SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=%s ORDER BY 1,2',
        'SELECT sequencename,last_value FROM pg_sequences WHERE schemaname=%s ORDER BY 1',
    ]:
        if source.execute(query, (schema,)).fetchall() != target.execute(query, (schema,)).fetchall():
            raise RuntimeError('索引或序列核对失败，配置未切换')
(root / 'runtime/database-transfer-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('PASS: all table contents, indexes and sequences verified; original database preserved.')
