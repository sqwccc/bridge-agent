"""只读审计连接；不执行配置文本，不输出连接凭据。"""
from pathlib import Path
from urllib.parse import urlparse
import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]


def connect():
    config = dict(line.split('=', 1) for line in (ROOT / '.env.local').read_text(encoding='utf-8-sig').splitlines()
                  if line.strip() and not line.lstrip().startswith('#') and '=' in line)
    config = {k.strip(): v.strip().strip('\"').strip("'") for k, v in config.items()}
    url = urlparse(config['SOURCE_DB_URL'].removeprefix('jdbc:'))
    db = psycopg.connect(host=url.hostname, port=url.port or 5432, dbname=url.path.lstrip('/'),
                         user=config['SOURCE_DB_USER'], password=config['SOURCE_DB_PASSWORD'],
                         connect_timeout=10, options='-c default_transaction_read_only=on -c statement_timeout=30000')
    db.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(config.get('SOURCE_DB_SCHEMA', 'qiaoliang'))))
    return db
