"""将本地只读桥梁副本复制到配置的远程独立 schema；事务失败全量回滚。"""
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from psycopg import sql
from importlib.util import spec_from_file_location, module_from_spec

root = Path(__file__).resolve().parents[1]
spec = spec_from_file_location('local_import', root / 'scripts/init-local.py')
module = module_from_spec(spec)
spec.loader.exec_module(module)
config = dict(line.split('=', 1) for line in
              (root / '.env.local').read_text(encoding='utf-8').splitlines()
              if line and not line.startswith('#') and '=' in line)
url = urlparse(config['APP_DB_URL'].removeprefix('jdbc:'))
schema = config['APP_DB_SCHEMA']
if schema != 'bridgemind_test':
    raise ValueError('此脚本仅允许写入 bridgemind_test')
report = {}
with psycopg.connect(host='localhost', dbname='bridgemind_source',
                      user='bridgemind_reader', password='bridgemind_dev_reader',
                      options='-c default_transaction_read_only=on') as source, \
     psycopg.connect(host=url.hostname, port=url.port, dbname=url.path.lstrip('/'),
                      user=config['APP_DB_USER'], password=config['APP_DB_PASSWORD'],
                      connect_timeout=10) as target:
    source.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    target.execute('SET LOCAL search_path TO bridgemind_test')
    for table in module.TABLES:
        if target.execute('SELECT to_regclass(%s)', (f'{schema}.{table}',)).fetchone()[0]:
            raise RuntimeError(f'{table} 已存在；拒绝覆盖任何已有表')
    for table in module.TABLES:
        columns = source.execute("""SELECT a.attname,format_type(a.atttypid,a.atttypmod)
          FROM pg_attribute a WHERE a.attrelid=%s::regclass AND a.attnum>0
          AND NOT a.attisdropped ORDER BY a.attnum""", (f'qiaoliang.{table}',)).fetchall()
        dest = sql.Identifier(schema, table)
        target.execute(sql.SQL('CREATE TABLE {} ({})').format(dest, sql.SQL(',').join(
            sql.SQL('{} {}').format(sql.Identifier(name), sql.SQL(dtype)) for name, dtype in columns)))
        digest = hashlib.sha256()
        with source.cursor().copy(sql.SQL('COPY {} TO STDOUT').format(sql.Identifier('qiaoliang', table))) as reader, \
             target.cursor().copy(sql.SQL('COPY {} FROM STDIN').format(dest)) as writer:
            buffer = bytearray()
            for chunk in reader:
                digest.update(chunk)
                buffer.extend(chunk)
                if len(buffer) >= 1024 * 1024:
                    writer.write(buffer)
                    buffer.clear()
            if buffer:
                writer.write(buffer)
        expected = source.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier('qiaoliang', table))).fetchone()[0]
        actual = target.execute(sql.SQL('SELECT count(*) FROM {}').format(dest)).fetchone()[0]
        check = hashlib.sha256()
        with target.cursor().copy(sql.SQL('COPY {} TO STDOUT').format(dest)) as reader:
            for chunk in reader:
                check.update(chunk)
        if actual != expected or check.digest() != digest.digest():
            raise RuntimeError(f'{table}: 数量或内容校验失败，回滚')
        indexes = source.execute("SELECT indexdef FROM pg_indexes WHERE schemaname='qiaoliang' AND tablename=%s", (table,)).fetchall()
        for (definition,) in indexes:
            target.execute(definition.replace(' ON qiaoliang.', ' ON bridgemind_test.'))
        target.execute(sql.SQL('ANALYZE {}').format(dest))
        report[table] = {'rows': actual, 'sha256': digest.hexdigest(), 'verified': True}
        print(f'{table}: {actual} rows verified', flush=True)
(root / 'runtime/remote-source-import.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('Committed: all source tables are in bridgemind_test.')
