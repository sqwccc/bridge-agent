"""来源覆盖率只读审计；不输出人员、联系方式或附件凭据。"""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from source_db import connect

ROOT = Path(__file__).resolve().parents[1]
# 复用实际公共 SQL，避免审计规则与应用的去重、删除和关联规则漂移。
mapper = ET.parse(ROOT / 'backend/src/main/resources/mapper/source/bridge/BridgeMapper.xml').getroot()
BASE = ''.join(mapper.find("sql[@id='base']").itertext()) + """,
bridges AS (SELECT * FROM bridge_base), points AS (SELECT * FROM point_source),
candidates AS (SELECT * FROM point_candidates), mapped AS (SELECT * FROM point_bridge)
"""
queries = {
    'active_bridges': 'SELECT count(*) FROM bridges',
    'valid_coordinates': 'SELECT count(*) FROM bridges WHERE jd BETWEEN -180 AND 180 AND wd BETWEEN -90 AND 90 AND NOT(jd=0 AND wd=0)',
    'missing_coordinates': 'SELECT count(*) FROM bridges WHERE jd IS NULL OR wd IS NULL',
    'monitor_points': 'SELECT count(*) FROM points',
    'mapped_points': 'SELECT count(*) FROM mapped',
    'ambiguous_points': 'SELECT count(DISTINCT (sscsdm,bsm)) FROM candidates WHERE matches>1',
    'bridges_with_points': 'SELECT count(DISTINCT bridge_id) FROM mapped',
    'mapped_alarms': "SELECT count(*) FROM dwd_ql_jc_jcbj_data a WHERE coalesce(a.sjtbzt,'')!='D' AND EXISTS(SELECT 1 FROM mapped p WHERE p.bsm=a.dwbsm AND p.sscsdm=a.sscsdm)",
    'monitor_samples': 'SELECT count(*) FROM dwd_ql_jc_jcz_inc',
    'analysis_reports': 'SELECT count(*) FROM ql_jc_sjfxbg',
    'bridge_report_paths': "SELECT count(*) FROM bridges WHERE nullif(trim(jcbg),'') IS NOT NULL",
    'bridge_pdf_paths': "SELECT count(*) FROM bridges WHERE lower(jcbg) LIKE '%.pdf'",
    'inspection_records_mapped': """SELECT count(*) FROM dwd_ql_jg_dqjc_all r
      JOIN (SELECT sscsdm,bridge_key FROM bridge_keys GROUP BY sscsdm,bridge_key HAVING count(*)=1) k
        ON ARRAY[r.sscsdm,r.jcdx]::text[]=ARRAY[k.sscsdm,k.bridge_key]::text[]
      WHERE coalesce(r.sjtbzt,'')!='D'""",
}
with connect() as db:
    result = {}
    for key, query in queries.items():
        try:
            result[key] = db.execute(BASE + query).fetchone()[0]
        except Exception as error:
            raise RuntimeError(f'审计查询失败：{key}') from error
    result['mapped_alarm_range'] = list(db.execute(BASE + "SELECT min(a.bjsj),max(a.bjsj) FROM dwd_ql_jc_jcbj_data a WHERE EXISTS(SELECT 1 FROM mapped p WHERE p.bsm=a.dwbsm AND p.sscsdm=a.sscsdm)").fetchone())
output=json.dumps(result,ensure_ascii=False,indent=2,default=str)
(ROOT/'runtime/source-audit.json').write_text(output,encoding='utf-8')
print(output)
