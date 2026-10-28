"""仅初始化本地双库并解析导入选定桥梁资料，不执行资料中的任意 SQL。"""
import hashlib
import json
import os
import re
from pathlib import Path

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
TABLES = ['area', 'dwd_ql_js_ql_inc', 'dwd_ql_js_sjzd_inc',
          'dwd_ql_jc_jcd_inc', 'dwd_ql_jc_jcsb_inc', 'dwd_ql_jc_jcz_inc',
          'dwd_ql_jc_jcbj_data', 'dwd_ql_jc_bjcz_data', 'ql_jc_sjfxbg',
          'ql_sys_file', 'dwd_ql_js_fjxxb_inc', 'dwd_ql_jg_cgdj_inc', 'dwd_ql_jg_dqjc_all']
TOKEN = re.compile(r"\s*('(?:[^']|'')*'|NULL|true|false|[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*([,)])", re.I)
HEADER = re.compile(r'INSERT INTO\s+qiaoliang\.(\w+)\s*\((.*?)\)\s*VALUES\s*', re.S | re.I)


def rows(text, start=0):
    """支持字符串内逗号、括号、换行及双单引号；遇到表达式立即拒绝。"""
    pos = start
    while pos < len(text):
        while pos < len(text) and text[pos] in ' \r\n\t,;':
            pos += 1
        if pos == len(text):
            return
        if text[pos] != '(':
            raise ValueError(f'非数据行，偏移 {pos}')
        pos += 1
        row = []
        while True:
            match = TOKEN.match(text, pos)
            if not match:
                raise ValueError(f'不支持的 SQL 数据字面量，偏移 {pos}')
            value, end = match.groups()
            row.append(value[1:-1].replace("''", "'") if value.startswith("'") else None if value.upper() == 'NULL' else value)
            pos = match.end()
            if end == ')':
                break
        yield row


def connect(db='postgres'):
    return psycopg.connect(host='localhost', port=5432, dbname=db, user='postgres',
                          password=os.environ.get('PG_ADMIN_PASSWORD', 'postgres_pass'), autocommit=True)


def main():
    app_password = os.environ.get('APP_DB_PASSWORD', 'bridgemind_dev_app')
    source_password = os.environ.get('SOURCE_DB_PASSWORD', 'bridgemind_dev_reader')
    with connect() as db:
        for role, password in [('bridgemind_app', app_password), ('bridgemind_reader', source_password)]:
            if not db.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (role,)).fetchone():
                db.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {}').format(sql.Identifier(role), sql.Literal(password)))
        for name, owner in [('bridgemind', 'bridgemind_app'), ('bridgemind_source', 'postgres')]:
            if not db.execute('SELECT 1 FROM pg_database WHERE datname=%s', (name,)).fetchone():
                db.execute(sql.SQL('CREATE DATABASE {} OWNER {}').format(sql.Identifier(name), sql.Identifier(owner)))
        db.execute("ALTER ROLE bridgemind_reader SET default_transaction_read_only=on")
    metadata = next((ROOT / 'docs/历史资料/sql/ql/2').glob('*.sql')).read_text(encoding='utf-8-sig')
    # 元数据第一条 INSERT 的表名本身是查询文本，只解析 VALUES 后的五列字面量。
    fields = {}
    for row in rows(metadata, metadata.index(' VALUES') + len(' VALUES')):
        if row[0] in TABLES:
            fields.setdefault(row[0], []).append(row)
    report = {'tables': {}, 'notes': ['geometry 字段在本地副本以 text 保留，本期不依赖 PostGIS。']}
    with connect('bridgemind_source') as db:
        db.execute('CREATE SCHEMA IF NOT EXISTS qiaoliang')
        for table in TABLES:
            columns = fields[table]
            defs = []
            for _, name, dtype, *_ in columns:
                dtype = 'text' if dtype.startswith('geometry') else dtype
                if not re.fullmatch(r'[a-zA-Z0-9_ (),\[\]]+', dtype):
                    raise ValueError('不支持的字段类型')
                defs.append(sql.SQL('{} {}').format(sql.Identifier(name), sql.SQL(dtype)))
            target = sql.Identifier('qiaoliang', table)
            db.execute(sql.SQL('CREATE TABLE IF NOT EXISTS {} ({})').format(target, sql.SQL(',').join(defs)))
            path = ROOT / 'docs/历史资料/sql/ql/1' / (table + '0929.sql')
            source = path.read_text(encoding='utf-8-sig')
            before = db.execute(sql.SQL('SELECT count(*) FROM {}').format(target)).fetchone()[0]
            imported = 0
            if before == 0 and source.strip():
                headers = list(HEADER.finditer(source))
                if not headers:
                    raise ValueError(f'{table}: 无合法 INSERT 头')
                with db.transaction():
                    for i, header in enumerate(headers):
                        if header[1] != table:
                            raise ValueError('来源表不匹配')
                        names = [c.strip().strip('"') for c in header[2].split(',')]
                        if not set(names).issubset({f[1] for f in columns}):
                            raise ValueError(f'{table}: 字段元数据缺失')
                        segment = source[header.end():headers[i+1].start() if i+1 < len(headers) else len(source)]
                        with db.cursor().copy(sql.SQL('COPY {} ({}) FROM STDIN').format(target, sql.SQL(',').join(map(sql.Identifier, names)))) as copy:
                            for row in rows(segment):
                                if len(row) != len(names):
                                    raise ValueError(f'{table}: 列数不匹配')
                                copy.write_row(row)
                                imported += 1
            count = db.execute(sql.SQL('SELECT count(*) FROM {}').format(target)).fetchone()[0]
            report['tables'][table] = {'rows': count, 'imported': imported, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            print(f'{table}: {count} rows ({imported} imported)', flush=True)
        indexes = {'dwd_ql_js_ql_inc': ['qlid','qlbh','sscsdm'], 'dwd_ql_jc_jcd_inc': ['bsm','ssbm'],
                   'dwd_ql_jc_jcsb_inc': ['bsm','dwbsm'], 'dwd_ql_jc_jcz_inc': ['dwbsm','jccjsj'],
                   'dwd_ql_jc_jcbj_data': ['dwbsm','bjsj'], 'dwd_ql_jc_bjcz_data': ['bjbh'],
                   'dwd_ql_js_fjxxb_inc': ['fid'], 'dwd_ql_jg_cgdj_inc': ['qlid'], 'dwd_ql_jg_dqjc_all': ['jcdx']}
        for table, columns in indexes.items():
            for col in columns:
                db.execute(sql.SQL('CREATE INDEX IF NOT EXISTS {} ON {} ({})').format(sql.Identifier('ix_' + table + '_' + col), sql.Identifier('qiaoliang',table), sql.Identifier(col)))
        db.execute('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
        db.execute('GRANT USAGE ON SCHEMA qiaoliang TO bridgemind_reader')
        db.execute('GRANT SELECT ON ALL TABLES IN SCHEMA qiaoliang TO bridgemind_reader')
        db.execute('ALTER DEFAULT PRIVILEGES IN SCHEMA qiaoliang GRANT SELECT ON TABLES TO bridgemind_reader')
        db.execute('ANALYZE')
        report['quality'] = dict(db.execute("""SELECT 'active_bridges', count(*) FROM qiaoliang.dwd_ql_js_ql_inc WHERE coalesce(sczt,0)=0
            UNION ALL SELECT 'missing_bridge_ids', count(*) FROM qiaoliang.dwd_ql_js_ql_inc WHERE nullif(trim(qlid),'') IS NULL
            UNION ALL SELECT 'duplicate_bridge_ids', count(*) FROM (SELECT qlid FROM qiaoliang.dwd_ql_js_ql_inc GROUP BY qlid HAVING count(*)>1) x
            UNION ALL SELECT 'missing_coordinates',count(*) FROM qiaoliang.dwd_ql_js_ql_inc WHERE jd IS NULL OR wd IS NULL""").fetchall())
    output = ROOT / 'runtime/import-report.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('导入完成；报告 runtime/import-report.json。不覆盖非空来源表。')


if __name__ == '__main__':
    main()
