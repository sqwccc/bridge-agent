"""Import the supplied Wanfu workbook extraction into the isolated test copy.

Run scripts/extract-wanfu-monitoring.py with the bundled spreadsheet Python first.
Default is a dry run; --apply inserts missing records in one transaction.
Existing differing records abort rather than overwrite. Original workbook is untouched.
"""
import argparse
import json
import hashlib
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    source = json.loads((ROOT / 'runtime/wanfu-source.json').read_text(encoding='utf-8'))
    points, devices, thresholds, samples = [s['rows'] for s in source['sheets']]
    assert all(str(p['ssbm']) == '10905200071' for p in points)
    point_ids = {p['bsm'] for p in points}
    device_metrics = {(d['bsm'], d['jczb']) for d in devices}
    assert all(d['dwbsm'] in point_ids for d in devices)
    assert all(s['dwbsm'] in point_ids and (s['sbbsm'], s['jczb']) in device_metrics and str(s['sscsdm']) == '321000' for s in samples)
    selected = [t for t in thresholds if (t['sbbsm'], t['jczb']) in device_metrics]
    config = dict(line.split('=', 1) for line in (ROOT / '.env.local').read_text(encoding='utf-8-sig').splitlines() if line.strip() and not line.startswith('#') and '=' in line)
    config = {k.strip(): v.strip().strip('\"').strip("'") for k, v in config.items()}
    url = urlparse(config['SOURCE_DB_URL'].removeprefix('jdbc:'))
    assert url.path == '/bridgemind_test' and config['SOURCE_DB_SCHEMA'] == 'qiaoliang'
    report = {'source': source['source'], 'sha256': source['sha256'], 'bridgeId': '10905200071', 'excludedUnrelatedThresholds': len(thresholds)-len(selected), 'from': min(s['jccjsj'] for s in samples), 'to': max(s['jccjsj'] for s in samples), 'tables': {}, 'applied': args.apply}
    with psycopg.connect(host=url.hostname, port=url.port or 5432, dbname='bridgemind_test', user=config['SOURCE_DB_USER'], password=config['SOURCE_DB_PASSWORD'], connect_timeout=10) as db:
        db.execute("SET LOCAL lock_timeout='10s'")
        assert db.execute("SELECT count(*) FROM qiaoliang.dwd_ql_js_ql_inc WHERE qlid='10905200071' AND sscsdm='321000' AND qlmc='万福大桥'").fetchone()[0] == 1
        for table, rows in [('dwd_ql_jc_jcd_inc', points), ('dwd_ql_jc_jcsb_inc', devices), ('dwd_ql_jc_jcxyz_inc', selected), ('dwd_ql_jc_jcz_inc', samples)]:
            columns = dict(db.execute("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='qiaoliang' AND table_name=%s", (table,)))
            target = sql.Identifier('qiaoliang', table)
            inserted = existing = 0
            seen = set()
            batch = []
            for row in rows:
                mapped = {}
                for key, value in row.items():
                    key = ('sjtbsj' if key == 'tbsj' and table != 'dwd_ql_jc_jcz_inc' else 'azsj' if key == 'azrq' else key)
                    if key in columns:
                        if value is not None and columns[key] == 'character varying': value = str(value)
                        if value is not None and columns[key] == 'date': value = datetime.fromisoformat(value).date()
                        mapped[key] = value
                mapped['sscsdm'] = '321000'
                if table == 'dwd_ql_jc_jcxyz_inc':
                    # Source bsm incorrectly repeats across levels; preserve original
                    # fields in the extraction and use a deterministic import key.
                    identity = [row[k] for k in ('bsm', 'sbbsm', 'jczb', 'jcjb', 'yzsx', 'yzxx')]
                    mapped['bsm'] = 'wanfu-' + hashlib.sha256(json.dumps(identity).encode()).hexdigest()[:32]
                assert mapped['bsm'] not in seen, 'Duplicate workbook identifier'
                seen.add(mapped['bsm'])
                names = list(mapped)
                values = list(mapped.values())
                batch.append(values)
            stage = sql.Identifier('wanfu_stage')
            db.execute(sql.SQL('CREATE TEMP TABLE {} (LIKE {}) ON COMMIT DROP').format(stage, target))
            fields = sql.SQL(',').join(map(sql.Identifier, names))
            with db.cursor().copy(sql.SQL('COPY {} ({}) FROM STDIN').format(stage, fields)) as copy:
                for values in batch:
                    copy.write_row(values)
            same = sql.SQL(' AND ').join(sql.SQL('t.{} IS NOT DISTINCT FROM s.{}').format(sql.Identifier(n), sql.Identifier(n)) for n in names)
            conflict = db.execute(sql.SQL('SELECT count(*) FROM {} s JOIN {} t ON t.bsm=s.bsm AND t.sscsdm=s.sscsdm WHERE NOT ({})').format(stage, target, same)).fetchone()[0]
            if conflict: raise ValueError('Existing conflicting records: ' + table)
            existing = db.execute(sql.SQL('SELECT count(*) FROM {} s WHERE EXISTS (SELECT 1 FROM {} t WHERE t.bsm=s.bsm AND t.sscsdm=s.sscsdm)').format(stage, target)).fetchone()[0]
            inserted = len(batch) - existing
            if args.apply:
                db.execute(sql.SQL('INSERT INTO {} ({}) SELECT {} FROM {} s WHERE NOT EXISTS (SELECT 1 FROM {} t WHERE t.bsm=s.bsm AND t.sscsdm=s.sscsdm)').format(target, fields, sql.SQL(',').join(sql.SQL('s.{}').format(sql.Identifier(n)) for n in names), stage, target))
            db.execute(sql.SQL('DROP TABLE {}').format(stage))
            report['tables'][table] = {'selected': len(rows), 'inserted' if args.apply else 'pending': inserted, 'existing': existing}
            print(table, report['tables'][table], flush=True)
    report_name = 'wanfu-import-report.json' if args.apply else 'wanfu-import-check.json'
    (ROOT / 'runtime' / report_name).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
