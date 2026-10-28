"""创建配置指定的全新业务 schema；已存在即拒绝，不修改原有对象。"""
import json
import re
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import psycopg
from psycopg import sql

root = Path(__file__).resolve().parents[1]
config = dict(line.split('=', 1) for line in
              (root / '.env.local').read_text(encoding='utf-8').splitlines()
              if line and not line.startswith('#') and '=' in line)
url = urlparse(config['APP_DB_URL'].removeprefix('jdbc:'))
schema = config['APP_DB_SCHEMA']
if not re.fullmatch(r'[a-z][a-z0-9_]*', schema) or schema in ('public', 'information_schema') or schema.startswith('pg_'):
    raise ValueError('必须使用独立的业务 schema')
if parse_qs(url.query).get('currentSchema') != [schema]:
    raise ValueError('JDBC currentSchema 必须与 APP_DB_SCHEMA 一致')
with psycopg.connect(host=url.hostname, port=url.port or 5432,
                      dbname=url.path.lstrip('/'), user=config['APP_DB_USER'],
                      password=config['APP_DB_PASSWORD'], connect_timeout=8) as conn:
    if conn.execute('SELECT 1 FROM pg_namespace WHERE nspname=%s', (schema,)).fetchone():
        raise RuntimeError('schema 已存在，拒绝修改；无需重复创建')
    # 保存其他 schema 的对象清单，供迁移后的隔离核查使用。
    objects = conn.execute("""SELECT n.nspname,c.relname,c.relkind
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
        ORDER BY 1,2,3""").fetchall()
    target = root / 'runtime' / 'remote-schema-baseline.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(objects, ensure_ascii=False, indent=2), encoding='utf-8')
    conn.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION CURRENT_USER').format(sql.Identifier(schema)))
    print(f'已新建 {url.path.lstrip("/")}.{schema}；未修改原有 schema。')
