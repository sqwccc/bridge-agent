"""流式解析全部来源 INSERT，仅写 qiaoliang；不执行包中的 SQL。支持逐表续传。"""
import hashlib
import importlib.util
import json
import re
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('original_import', ROOT / 'scripts/init-local.py')
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)
TOKEN = re.compile(r"\s*('(?:[^']|'')*'|NULL|true|false|[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|@[^,\r\n)]+)\s*([,)])", re.I)


class Stream:
    def __init__(self, path):
        self.file = path.open(encoding='utf-8-sig')
        self.buffer = ''
        self.pos = 0
        self.eof = False

    def fill(self):
        chunk = self.file.read(1024 * 1024)
        self.buffer = self.buffer[self.pos:] + chunk
        self.pos = 0
        self.eof = not chunk

    def skip(self):
        while True:
            match = re.compile(r'[\s,;]*').match(self.buffer, self.pos)
            self.pos = match.end()
            if self.pos < len(self.buffer) or self.eof:
                return
            self.fill()

    def match(self, pattern):
        while True:
            match = pattern.match(self.buffer, self.pos)
            if match:
                self.pos = match.end()
                return match
            if self.eof:
                raise ValueError('不支持的来源 SQL 字面量或语法（不输出数据内容）')
            if len(self.buffer) - self.pos > 32 * 1024 * 1024:
                raise ValueError('单字段超过 32MB 或不支持的 SQL 表达式')
            self.fill()


def records(path, table):
    stream = Stream(path)
    columns = None
    try:
        while True:
            stream.skip()
            if stream.pos == len(stream.buffer) and stream.eof:
                return
            if stream.buffer[stream.pos] != '(':
                header = stream.match(original.HEADER)
                if header[1] != table:
                    raise ValueError('INSERT 目标与文件名不一致')
                names = [n.strip().strip('"') for n in header[2].split(',')]
                if columns is not None and columns != names:
                    raise ValueError('同一文件中的 INSERT 列顺序不同')
                columns = names
                stream.skip()
            if not columns or stream.buffer[stream.pos] != '(':
                raise ValueError('来源行格式不正确')
            stream.pos += 1
            row = []
            while True:
                token = stream.match(TOKEN)
                value, end = token.groups()
                if value.startswith('@'):
                    # 导出工具的二进制附件引用；仅允许本包 files 目录中的匹配文件。
                    filename = value[1:].replace('\\', '/').rsplit('/', 1)[-1]
                    if not re.fullmatch(re.escape(path.name) + r'-\d+\.data', filename):
                        raise ValueError('非法的附件数据引用')
                    row.append((path.parent / 'files' / filename).read_bytes())
                else:
                    row.append(value[1:-1].replace("''", "'") if value.startswith("'") else
                               None if value.upper() == 'NULL' else value)
                if end == ')':
                    break
            if len(row) != len(columns):
                raise ValueError('来源列数不一致')
            yield columns, row
    finally:
        stream.file.close()


def main():
    config = dict(l.split('=', 1) for l in (ROOT / '.env.local').read_text().splitlines()
                  if l and not l.startswith('#') and '=' in l)
    url = urlparse(config['SOURCE_DB_URL'].removeprefix('jdbc:'))
    assert url.path == '/bridgemind_test' and config['SOURCE_DB_SCHEMA'] == 'qiaoliang'
    metadata = next((ROOT / 'docs/历史资料/sql/ql/2').glob('*.sql')).read_text(encoding='utf-8-sig')
    fields = {}
    for row in original.rows(metadata, metadata.index(' VALUES') + 7):
        fields.setdefault(row[0], []).append(row)
    files = sorted((ROOT / 'docs/历史资料/sql/ql/1').glob('*.sql'), key=lambda p: (p.stat().st_size, p.name))
    assert {p.stem.removesuffix('0929') for p in files} == set(fields)
    report_path = ROOT / 'runtime/full-source-import.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {'tables': {}, 'failures': {}}
    with psycopg.connect(host=url.hostname, port=url.port, dbname='bridgemind_test',
                          user=config['SOURCE_DB_USER'], password=config['SOURCE_DB_PASSWORD'],
                          connect_timeout=10, autocommit=True) as db:
        assert db.execute("SELECT to_regnamespace('qiaoliang') IS NOT NULL").fetchone()[0]
        db.execute("SET lock_timeout='10s'")
        system_query = """SELECT md5(row_to_json(t)::text) FROM bridgemind_test.bm_user t
            UNION ALL SELECT md5(row_to_json(t)::text) FROM bridgemind_test.flyway_schema_history t ORDER BY 1"""
        system_before = db.execute(system_query).fetchall()
        for index, path in enumerate(files, 1):
            table = path.stem.removesuffix('0929')
            with path.open('rb') as f:
                digest = hashlib.file_digest(f, 'sha256').hexdigest()
            target = sql.Identifier('qiaoliang', table)
            prior = report['tables'].get(table)
            if prior and prior['sha256'] == digest and db.execute('SELECT to_regclass(%s)', ('qiaoliang.'+table,)).fetchone()[0]:
                if db.execute(sql.SQL('SELECT count(*) FROM {}').format(target)).fetchone()[0] == prior['rows']:
                    continue
            count = 0
            print(f'[{index}/{len(files)}] BEGIN {table} ({path.stat().st_size} bytes)', flush=True)
            try:
                with db.transaction():
                    exists = db.execute('SELECT to_regclass(%s)', ('qiaoliang.'+table,)).fetchone()[0]
                    defs = []
                    for _, name, dtype, *_ in fields[table]:
                        dtype = 'text' if dtype.startswith('geometry') else dtype
                        if not re.fullmatch(r'[a-zA-Z0-9_ (),\[\]]+', dtype):
                            raise ValueError('非法字段类型')
                        defs.append(sql.SQL('{} {}').format(sql.Identifier(name), sql.SQL(dtype)))
                    destination = sql.Identifier('source_import_stage') if exists else target
                    db.execute(sql.SQL('CREATE {} TABLE {} ({}) {}').format(
                        sql.SQL('TEMP' if exists else ''), destination, sql.SQL(',').join(defs),
                        sql.SQL('ON COMMIT DROP' if exists else '')))
                    rows = records(path, table)
                    first = next(rows, None)
                    if first:
                        columns, row = first
                        if not set(columns).issubset({r[1] for r in fields[table]}):
                            raise ValueError('字段元数据不匹配')
                        with db.cursor().copy(sql.SQL('COPY {} ({}) FROM STDIN').format(
                                destination, sql.SQL(',').join(map(sql.Identifier, columns)))) as copy:
                            copy.write_row(row)
                            count = 1
                            for _, row in rows:
                                copy.write_row(row)
                                count += 1
                                if count % 100000 == 0:
                                    print(f'  {table}: {count} rows streamed', flush=True)
                    if exists:
                        # EXCEPT ALL 保留重复行计数，已存在的表必须与包完全相同。
                        mismatch = db.execute(sql.SQL('SELECT EXISTS((SELECT row_to_json(t)::text FROM {} t EXCEPT ALL SELECT row_to_json(t)::text FROM {} t) UNION ALL (SELECT row_to_json(t)::text FROM {} t EXCEPT ALL SELECT row_to_json(t)::text FROM {} t))').format(
                            destination, target, target, destination)).fetchone()[0]
                        if mismatch:
                            raise ValueError('已有表与包不一致，未覆盖')
                    assert db.execute(sql.SQL('SELECT count(*) FROM {}').format(target)).fetchone()[0] == count
                    if not exists:
                        db.execute(sql.SQL('ANALYZE {}').format(target))
                report['tables'][table] = {'rows': count, 'sha256': digest, 'status': 'verified-existing' if exists else 'imported'}
                report['failures'].pop(table, None)
                print(f'  OK {table}: {count} rows', flush=True)
            except Exception as error:
                # 不输出源系统账号、日志、手机号等原始值。
                report['failures'][table] = {'type': type(error).__name__, 'sqlstate': getattr(error, 'sqlstate', None), 'parsedRows': count}
                print(f'  FAILED {table}: {type(error).__name__}, sqlstate={getattr(error,"sqlstate",None)}, parsedRows={count}', flush=True)
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        assert db.execute(system_query).fetchall() == system_before, '本系统表内容发生变化'
        report['systemTablesUnchanged'] = True
        report['expectedTables'] = len(files)
        report['totalRows'] = sum(item['rows'] for item in report['tables'].values())
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'COMPLETE: {len(report["tables"])} verified tables, {len(report["failures"])} failures; system tables unchanged.', flush=True)
    if report['failures']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
