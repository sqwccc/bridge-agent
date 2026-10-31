"""Read-only source + live HTTP acceptance. Writes only local verification evidence.

Requires local preview access or an existing account via the established app setup.
Use --model after updating the local Dify apps to also verify real model answering.
"""
import argparse
import http.cookiejar
import json
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from source_db import connect

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8088/api/v1/"


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--model", action="store_true")
    options = args.parse_args()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def get(path):
        with opener.open(BASE + path, timeout=30) as response:
            return json.load(response)["data"]

    def ask(question, scope="network", bridge=None, conversation=None, mode="rule"):
        csrf = get("auth/csrf")
        body = {"scope": scope, "question": question, "answerMode": mode}
        if bridge:
            body["bridgeId"] = bridge
        if conversation:
            body["conversationId"] = conversation
        request = urllib.request.Request(BASE + "agent/ask", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", csrf["headerName"]: csrf["token"]})
        with opener.open(request, timeout=190) as response:
            raw = response.read().decode("utf-8")
        events = []
        for block in raw.replace("\r\n", "\n").split("\n\n"):
            event, data = None, []
            for line in block.splitlines():
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    data.append(line[5:])
            if data:
                events.append({"event": event, "data": json.loads("\n".join(data))})
        assert events and events[-1]["event"] == "done", "Stream did not complete"
        return events

    def event(events, name):
        return next(e["data"] for e in events if e["event"] == name)

    summary = get("dashboard")
    overview = ask("各地市接入桥梁数量对比")
    chart = event(overview, "visualization")
    assert sum(r["value"] for r in chart["rows"]) == summary["total"]
    follow = ask("为什么", conversation=event(overview, "meta")["conversationId"])
    assert "依据说明" in event(follow, "replace")["text"]
    mapper = ET.parse(ROOT / "backend/src/main/resources/mapper/source/bridge/BridgeMapper.xml").getroot()
    base = "".join(mapper.find("sql[@id='base']").itertext())
    with connect() as db:
        row = db.execute(base + """ SELECT p.bridge_id,s.sbbsm,min(s.jccjsj),max(s.jccjsj),count(*)
            FROM dwd_ql_jc_jcz_inc s JOIN point_bridge p ON p.bsm=s.dwbsm AND p.sscsdm=s.sscsdm
            WHERE coalesce(s.sjtbzt,'')!='D' GROUP BY p.bridge_id,s.sbbsm HAVING count(*) BETWEEN 6 AND 2000
            ORDER BY count(*) DESC,s.sbbsm LIMIT 1""").fetchone()
    assert row, "No source samples mapped to an accessible bridge"
    bridge, device, start, end, count = row
    question = f"设备 {device}，趋势，{start.isoformat(timespec='seconds')}至{end.isoformat(timespec='seconds')}"
    monitoring = ask(question, "bridge", bridge)
    analysis = event(monitoring, "evidence")["data"]["监测分析"]
    assert analysis["status"] == "available", analysis.get("message")
    channel = analysis["channels"][0]
    assert channel["statistics"]["sampleCount"] == count
    assert event(monitoring, "visualization")["type"] == "line"
    empty = ask(f"设备 {device}，趋势，2099-01-01T00:00至2099-01-02T00:00", "bridge", bridge)
    assert event(empty, "evidence")["data"]["监测分析"]["channels"][0]["statistics"]["status"] == "no_data"
    assert not any(e["event"] == "visualization" for e in empty)
    result = {"networkTotal": summary["total"], "sourceBridge": bridge, "sourceDevice": device, "sourceSampleCount": count,
              "overview": overview, "monitoring": monitoring, "empty": empty}
    if options.model:
        model = ask(question, "bridge", bridge, mode="auto")
        assert event(model, "plan")["monitoring"]["analysis"] == "trend"
        assert [e["data"]["engine"] for e in model if e["event"] == "source"] == ["model"], "Model fell back to rules"
        result["model"] = model
    (ROOT / "runtime/agent-enhancement-evidence.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"passed": True, "networkTotal": summary["total"], "sourceSampleCount": count, "modelVerified": options.model}))


if __name__ == "__main__":
    main()
