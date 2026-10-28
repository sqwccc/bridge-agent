"""一期字段与数据基线审计。连接配置来自 .env.local；只读事务，不输出凭据或人员信息。"""
import json
from datetime import datetime, timezone
from pathlib import Path
from psycopg import sql
from source_db import connect

ROOT = Path(__file__).resolve().parents[1]


def main():
    result = {'auditedAt': datetime.now(timezone.utc).isoformat(), 'readOnly': True}
    with connect() as db:
        tables = ['dwd_ql_js_ql_inc', 'dwd_ql_jc_jcd_inc', 'dwd_ql_jc_jcsb_inc', 'dwd_ql_jc_jcbj_data']
        result['schema'] = {t: dict(db.execute("SELECT column_name,data_type FROM information_schema.columns "
                                             "WHERE table_schema=current_schema() AND table_name=%s ORDER BY ordinal_position", (t,))) for t in tables}
        result['versions'] = {}
        for table in tables:
            key = 'qlid' if table == tables[0] else '(sscsdm,bsm)'
            total, distinct = db.execute(sql.SQL('SELECT count(*),count(DISTINCT {}) FROM {}').format(sql.SQL(key), sql.Identifier(table))).fetchone()
            result['versions'][table] = {'rows': total, 'distinctKeys': distinct, 'extraVersions': total - distinct}
        base = """WITH latest AS (
          SELECT DISTINCT ON(qlid) * FROM dwd_ql_js_ql_inc WHERE nullif(trim(qlid),'') IS NOT NULL
          ORDER BY qlid,sjtbsj DESC NULLS LAST,xgsj DESC NULLS LAST,sczt DESC NULLS LAST
        ), b AS (SELECT * FROM latest WHERE coalesce(sczt,0)=0 AND sscsdm LIKE '32%'),
        pl AS (SELECT DISTINCT ON(sscsdm,bsm) * FROM dwd_ql_jc_jcd_inc ORDER BY sscsdm,bsm,sjtbsj DESC NULLS LAST),
        p AS (SELECT * FROM pl WHERE coalesce(sjtbzt,'')!='D' AND (jclx=70 OR jclx IS NULL)),
        pc AS (SELECT p.*,b.qlid,count(*) OVER(PARTITION BY p.sscsdm,p.bsm) AS matches FROM p JOIN b
          ON b.sscsdm=p.sscsdm AND (p.ssbm=b.qlid OR p.ssbm=b.qlbh)),
        dl AS (SELECT DISTINCT ON(sscsdm,bsm) * FROM dwd_ql_jc_jcsb_inc ORDER BY sscsdm,bsm,sjtbsj DESC NULLS LAST),
        m AS (SELECT DISTINCT pc.qlid FROM pc JOIN dl d ON d.dwbsm=pc.bsm AND d.sscsdm=pc.sscsdm
          WHERE pc.matches=1 AND coalesce(d.sjtbzt,'')!='D') """
        scalar = {
            'activeBridges': 'SELECT count(*) FROM b',
            'removedBridges': "SELECT count(*) FROM latest WHERE sczt=1 AND sscsdm LIKE '32%'",
            'bridgesWithDevices': 'SELECT count(*) FROM m',
            'defaultLightweight': 'SELECT count(*) FROM b JOIN m USING(qlid) WHERE jkjclx IS NULL',
            'reportedMonitored': 'SELECT count(*) FROM b WHERE jkjclx IN(1,2)',
            'effectiveMonitored': 'SELECT count(*) FROM b LEFT JOIN m USING(qlid) WHERE jkjclx IN(1,2) OR (jkjclx IS NULL AND m.qlid IS NOT NULL)',
            'missingCondition': "SELECT count(*) FROM b WHERE nullif(trim(qlwhzk),'') IS NULL",
            'missingStructure': "SELECT count(*) FROM b WHERE nullif(trim(qljgzk),'') IS NULL",
            'conditionStructureDifferent': 'SELECT count(*) FROM b WHERE qlwhzk IS DISTINCT FROM qljgzk',
            'conditionalExemptions': 'SELECT count(*) FROM b WHERE sfcc=1 OR cczt=1 OR sfyj=1',
            'missingInspectionDate': 'SELECT count(*) FROM b WHERE jcrq IS NULL',
            'missingInspectionReport': "SELECT count(*) FROM b WHERE nullif(trim(jcbg),'') IS NULL",
            'ambiguousPoints': 'SELECT count(DISTINCT(sscsdm,bsm)) FROM pc WHERE matches>1',
            'builtWithoutTypeOrDevices': 'SELECT count(*) FROM b LEFT JOIN m USING(qlid) WHERE sfyjjcxt=true AND jkjclx IS NULL AND m.qlid IS NULL',
            'categoryGradeConflicts': "SELECT count(*) FROM b WHERE (yhlb=1 AND (qlwhzk IN('3','4','5','6','7') OR qljgzk IN('3','4','5','6','7'))) OR (yhlb BETWEEN 2 AND 5 AND (qlwhzk IN('1','2') OR qljgzk IN('1','2')))",
        }
        result['counts'] = {k: db.execute(base + q).fetchone()[0] for k, q in scalar.items()}
        result['distributions'] = {col: [{'code': code, 'count': count} for code, count in db.execute(base + f'SELECT {col},count(*) FROM b GROUP BY 1 ORDER BY 2 DESC')]
                                   for col in ['qlwhzk', 'qljgzk', 'jkjclx', 'yhlb', 'qlzt', 'sfyj', 'sfcc', 'cczt', 'sfyjjcxt']}
        result['monitoringEvidence'] = [dict(zip(['reportedType', 'bridges', 'withDevices', 'systemBuilt'], row)) for row in db.execute(base +
            'SELECT b.jkjclx,count(*),count(*) FILTER(WHERE m.qlid IS NOT NULL),count(*) FILTER(WHERE sfyjjcxt) FROM b LEFT JOIN m USING(qlid) GROUP BY 1 ORDER BY 1 NULLS FIRST')]
        candidates = [r[0] for r in db.execute("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND (tablename LIKE '%js_qf%' OR tablename LIKE '%jcxyz_inc' OR tablename LIKE '%jcbhxx_all' OR tablename LIKE '%yhwxxx_all' OR tablename='dwd_ql_xjjl_inc')")]
        result['futureTables'] = {t: db.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(t))).fetchone()[0] for t in candidates}
    target = ROOT / 'runtime/phase-one-audit.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'schema'}, ensure_ascii=False, indent=2, default=str))


if __name__ == '__main__':
    main()
