"""第二期只读核查；输出字段、汇总和数据缺口，不输出附件地址或人员信息。"""
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from psycopg import sql
from source_db import connect

ROOT = Path(__file__).resolve().parents[1]


def main():
    mapper = ET.parse(ROOT / 'backend/src/main/resources/mapper/source/bridge/BridgeMapper.xml').getroot()
    base = ''.join(mapper.find("sql[@id='base']").itertext())
    result = {'auditedAt': datetime.now(timezone.utc).isoformat(), 'readOnly': True, 'tables': {}}
    with connect() as db:
        for table, key in [('dwd_ql_js_ql_inc', 'qlid'), ('dwd_ql_jc_jcxyz_inc', '(sscsdm,bsm)'),
                           ('dwd_ql_jg_dqjc_all', '(sscsdm,bsm)'), ('dwd_ql_jg_cgdj_inc', '(sscsdm,id)'),
                           ('dwd_ql_js_fjxxb_inc', 'id'), ('ql_sys_file','id')]:
            rows, keys = db.execute(sql.SQL('SELECT count(*),count(DISTINCT {}) FROM {}').format(sql.SQL(key), sql.Identifier(table))).fetchone()
            columns = dict(db.execute('SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=%s ORDER BY ordinal_position', (table,)))
            result['tables'][table] = {'rows': rows, 'distinctKeys': keys, 'columns': columns}
        result['bridgeCoverage'] = dict(zip(['total', 'specialFlagProvided', 'registeredSpecialTypes', 'singleColumnPiers', 'normalUseNotDemolished', 'spanCountProvided', 'maxSpanProvided', 'deckAreaProvided'], db.execute(base + r"""
          SELECT count(*),count(*) FILTER(WHERE sfstql IS NOT NULL),
          count(*) FILTER(WHERE regexp_split_to_array(trim(coalesce(stql,'')),'\s*,\s*') && ARRAY['1','2','3']),
          count(*) FILTER(WHERE sfdzd=true),count(*) FILTER(WHERE qlzt=0 AND sfcc=0),
          count(*) FILTER(WHERE qlks IS NOT NULL),count(*) FILTER(WHERE dkzdkj IS NOT NULL),count(*) FILTER(WHERE qmmj IS NOT NULL) FROM bridge_active
        """).fetchone()))
        result['specialTypesRaw'] = [{'code': c, 'count': n} for c, n in db.execute(base + ' SELECT stql,count(*) FROM bridge_active GROUP BY 1 ORDER BY 2 DESC')]
        result['thresholds'] = dict(zip(['missingLevel', 'missingBounds', 'reversedBounds', 'extremePlaceholders'], db.execute("""
          SELECT count(*) FILTER(WHERE jcjb IS NULL),count(*) FILTER(WHERE yzxx IS NULL OR yzsx IS NULL),
          count(*) FILTER(WHERE yzxx>yzsx),count(*) FILTER(WHERE yzxx=-9999999.999 OR yzsx=9999999.999) FROM dwd_ql_jc_jcxyz_inc
        """).fetchone()))
        result['thresholds']['sameLevelMultipleIntervals'] = db.execute('SELECT count(*) FROM(SELECT sscsdm,sbbsm,jczb,jcjb FROM dwd_ql_jc_jcxyz_inc GROUP BY 1,2,3,4 HAVING count(*)>1)t').fetchone()[0]
        threshold_cte = """, tl AS (SELECT DISTINCT ON(sscsdm,bsm) * FROM dwd_ql_jc_jcxyz_inc ORDER BY sscsdm,bsm,sjtbsj DESC NULLS LAST),
        tm AS (SELECT t.*,p.bridge_id FROM tl t JOIN device_source d ON ARRAY[d.sscsdm,d.bsm,d.jczb]::text[]=ARRAY[t.sscsdm,t.sbbsm,t.jczb]::text[]
          JOIN point_bridge p ON ARRAY[p.sscsdm,p.bsm]::text[]=ARRAY[d.sscsdm,d.dwbsm]::text[] WHERE coalesce(t.sjtbzt,'')!='D') """
        result['mappedThresholds'] = dict(zip(['rows', 'bridges', 'missingBounds', 'reversedBounds'], db.execute(base + threshold_cte +
            'SELECT count(*),count(DISTINCT bridge_id),count(*) FILTER(WHERE yzxx IS NULL OR yzsx IS NULL),count(*) FILTER(WHERE yzxx>yzsx) FROM tm').fetchone()))
        result['sampleBridgeWithThresholds'] = db.execute(base + threshold_cte + 'SELECT bridge_id FROM tm GROUP BY 1 ORDER BY count(*) DESC LIMIT 1').fetchone()[0]
        result['reportData'] = {'regularAttachmentsMapped': db.execute('SELECT count(*) FROM dwd_ql_jg_cgdj_inc r JOIN dwd_ql_js_fjxxb_inc f ON f.fid=r.id').fetchone()[0]}
        result['reportData']['regularStatusValues'] = [{'code': c, 'count': n} for c, n in db.execute('SELECT zt,count(*) FROM dwd_ql_jg_cgdj_inc GROUP BY 1 ORDER BY 2 DESC')]
        result['reportData']['baseAttachments'] = dict(zip(['nonblank', 'emptyJsonArrays', 'otherJsonArrays', 'plainValues'], db.execute(base + """
          SELECT count(*) FILTER(WHERE nullif(trim(fj),'') IS NOT NULL),count(*) FILTER(WHERE trim(fj)='[]'),
          count(*) FILTER(WHERE fj LIKE '[%' AND trim(fj)!='[]'),count(*) FILTER(WHERE nullif(trim(fj),'') IS NOT NULL AND fj NOT LIKE '[%') FROM bridge_active
        """).fetchone()))
        result['reportData']['periodicAttachmentProvided'] = db.execute("SELECT count(*) FROM dwd_ql_jg_dqjc_all WHERE nullif(trim(fj),'') IS NOT NULL").fetchone()[0]
        result['reportData']['regularRecordsMapped'] = db.execute(base + ' SELECT count(*) FROM dwd_ql_jg_cgdj_inc r JOIN bridge_active b ON ARRAY[b.sscsdm,b.qlid]::text[]=ARRAY[r.sscsdm,r.qlid]::text[]').fetchone()[0]
        result['reportData']['taskAttachmentIndex'] = dict(zip(['files','tasks','bridgeIds','recordLinks'],db.execute('SELECT count(DISTINCT f.id),count(DISTINCT f.fid),count(DISTINCT r.qlid),count(*) FROM dwd_ql_js_fjxxb_inc f JOIN dwd_ql_jg_cgdj_inc r ON f.fid=r.rwid').fetchone()))
        result['reportData']['taskSystemFiles'] = dict(zip(['files','tasks','bridgeIds','recordLinks'],db.execute('SELECT count(DISTINCT f.id),count(DISTINCT f.p_id),count(DISTINCT r.qlid),count(*) FROM ql_sys_file f JOIN dwd_ql_jg_cgdj_inc r ON f.p_id=r.rwid').fetchone()))
        result['sampleBridgeWithTaskAttachments'] = db.execute(base + ' SELECT b.qlid FROM dwd_ql_js_fjxxb_inc f JOIN dwd_ql_jg_cgdj_inc r ON f.fid=r.rwid JOIN bridge_active b ON ARRAY[b.sscsdm,b.qlid]::text[]=ARRAY[r.sscsdm,r.qlid]::text[] LIMIT 1').fetchone()[0]
    target = ROOT / 'runtime/phase-two-audit.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'tables'}, ensure_ascii=False, indent=2, default=str))


if __name__ == '__main__':
    main()
