"""第三期只读审计：复用接口 SQL，输出汇总和字段，不输出人员或附件地址。"""
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

from source_db import connect

ROOT = Path(__file__).resolve().parents[1]
TABLES = {
    "patrols": ("dwd_ql_xjjl_inc", "fj"),
    "defects": ("dwd_ql_jg_jcbhxx_all", "bhtp"),
    "maintenance": ("dwd_ql_jg_yhwxxx_all", "wxhzp"),
}


def mapper_query(statement, values):
    """仅解释审计所需的 include/choose/if 和固定相等条件，不执行 XML 中的代码。"""
    nodes = {}
    namespaces = {}
    for name in ("bridge/BridgeMapper.xml", "work/WorkMapper.xml", "work/QualityMapper.xml"):
        root = ET.parse(ROOT / "backend/src/main/resources/mapper/source" / name).getroot()
        namespaces.update({id(node): root.get("namespace") for node in root.iter()})
        for child in root:
            if child.get("id"):
                nodes[f"{root.get('namespace')}.{child.get('id')}"] = child

    def condition(expression):
        match = re.fullmatch(r"(\w+)\s*(==|!=)\s*'([^']*)'", expression)
        if not match:
            raise ValueError(f"Unsupported audit condition: {expression}")
        name, operator, value = match.groups()
        equal = values[name] == value
        return equal if operator == "==" else not equal

    def render(node):
        if node.tag == "include":
            reference = node.get("refid")
            if "." not in reference:
                reference = namespaces[id(node)] + "." + reference
            return render(nodes[reference])
        if node.tag == "if" and not condition(node.get("test")):
            return ""
        if node.tag == "choose":
            selected = next((c for c in node if c.tag == "when" and condition(c.get("test"))), None)
            if selected is None:
                selected = node.find("otherwise")
            return "" if selected is None else render(selected)
        return (node.text or "") + "".join(render(c) + (c.tail or "") for c in node)

    params = []

    def bind(match):
        params.append(values[match.group(1)])
        return "%s"

    query = re.sub(r"#\{(\w+)\}", bind, render(nodes[statement]).replace("%", "%%"))
    return query, params


def audit():
    result = {"auditedAt": datetime.now(timezone.utc).isoformat(), "readOnly": True, "scope": "RAW_IMPORT", "tables": {}}
    queries = {}
    namespace = "com.bridgemind.work.mapper.QualityMapper."
    with connect() as db:
        db.execute("SET statement_timeout=180000")
        assert db.execute("SHOW transaction_read_only").fetchone()[0] == "on"
        for kind, (table, attachment) in TABLES.items():
            query, params = mapper_query(namespace + "profile", {"kind": kind, "city": ""})
            queries[kind] = query
            cursor = db.execute(query, params)
            profile = dict(zip([c.name for c in cursor.description], cursor.fetchone()))
            columns = db.execute("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=%s ORDER BY ordinal_position", (table,)).fetchall()
            statuses = db.execute(f"SELECT sjtbzt,count(*) FROM {table} GROUP BY 1 ORDER BY 1").fetchall()
            attachments = db.execute(f"SELECT count(*) FILTER(WHERE nullif(trim({attachment}),'') IS NOT NULL), count(*) FILTER(WHERE trim({attachment})='[]') FROM {table}").fetchone()
            result["tables"][kind] = {
                "table": table, "columns": dict(columns), "profile": profile,
                "syncStatuses": [{"value": s, "count": n} for s, n in statuses],
                "attachmentNonblank": attachments[0], "emptyJsonArrays": attachments[1],
                "rawAndLatestCountsEquivalent": profile["duplicate_excess"] == 0 and profile["missing_identifiers"] == 0 and profile["deleted_rows"] == 0,
            }
            print(kind, json.dumps(profile, ensure_ascii=False, default=str), flush=True)
        query, params = mapper_query(namespace + "relations", {"city": ""})
        queries["relations"] = query
        cursor = db.execute(query, params)
        result["currentMappedRelations"] = dict(zip([c.name for c in cursor.description], cursor.fetchone()))
        result["supplementaryMaintenanceRows"] = db.execute("SELECT count(*) FROM dwd_ql_jc_xjyhxx").fetchone()[0]
        bridge_base = "".join(ET.parse(ROOT / "backend/src/main/resources/mapper/source/bridge/BridgeMapper.xml").getroot().find("sql[@id='base']").itertext())
        result["supplementaryMaintenanceMappedRows"] = db.execute(bridge_base + " SELECT count(*) FROM dwd_ql_jc_xjyhxx r JOIN bridge_keys k ON ARRAY[k.sscsdm,k.bridge_key]::text[]=ARRAY[r.sscsdm,r.qlbh]::text[]").fetchone()[0]
        result["patrolResultValues"] = [{"value": v, "count": n} for v, n in db.execute("SELECT jcjg,count(*) FROM dwd_ql_xjjl_inc GROUP BY 1")]
        result["rawDuplicateDefectCodeGroups"] = db.execute("SELECT count(*) FROM(SELECT sscsdm,qlbh,bhbh FROM dwd_ql_jg_jcbhxx_all WHERE nullif(trim(bhbh),'') IS NOT NULL GROUP BY 1,2,3 HAVING count(*)>1)t").fetchone()[0]
    (ROOT / "runtime/phase-three-audit.json").write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    (ROOT / "runtime/phase-three-audit-queries.json").write_text(json.dumps(queries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result["currentMappedRelations"], ensure_ascii=False))
    return result


if __name__ == "__main__":
    audit()
