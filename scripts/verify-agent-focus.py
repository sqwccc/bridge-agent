"""Live acceptance of overall data and proposed maintenance answers.

Requires local preview access or an existing account via the established app setup.
Use --model after updating the local Dify apps to also verify real model answering.
"""
import argparse
import http.cookiejar
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8088/api/v1/"


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--model", action="store_true")
    args.add_argument("--scope", choices=["network", "bridge"], help="Verify one scope only")
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

    output = ROOT / "runtime/agent-focus-evidence.json"
    result = json.loads(output.read_text(encoding="utf-8")) if options.scope and output.exists() else {}
    for scope, bridge in [("network", None), ("bridge", "15032610123365813067")]:
        if options.scope and options.scope != scope:
            continue
        for question, topic in [("整体数据情况", "data_overview"), ("养护方案", "maintenance_plan")]:
            events = ask(question, scope, bridge, mode="auto" if options.model else "rule")
            name = scope + "_" + topic
            result[name] = events
            (ROOT / "runtime/agent-focus-evidence.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            assert event(events, "plan")["topic"] == topic, name
            evidence = event(events, "evidence")["data"]
            assert all(k in evidence for k in ["patrols", "defects", "maintenance", "监测数据覆盖"]), name
            assert event(events, "visualization")["type"] == "table", name
            if scope == "bridge":
                assert "technicalGrade" not in evidence["档案"], "Raw grade code leaked"
            if options.model:
                assert [e["data"]["engine"] for e in events if e["event"] == "source"] == ["model"], name
            if topic == "maintenance_plan":
                total = next(r["count"] for r in evidence["defects"]["全量聚合"] if r["dimension"] == "total")
                assert sum(g["count"] for g in evidence["养护编排"]["分组统计"]) == total
            print(name + " PASS", flush=True)
    print("Selected focus scenarios passed.")

if __name__ == "__main__":
    main()
