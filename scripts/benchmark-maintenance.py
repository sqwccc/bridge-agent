"""Read-only live timing and evidence capture; credentials are never recorded."""
import argparse
import http.cookiejar
import json
import time
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("label")
parser.add_argument("--bridge", default="10905200071", help="Bridge ID, or network")
parser.add_argument("--mode", choices=["auto", "rule"], default="auto")
parser.add_argument("--compare", help="Earlier JSON capture to compare business evidence")
args = parser.parse_args()
base = "http://127.0.0.1:8088/api/v1/"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
csrf = json.load(opener.open(base + "auth/csrf", timeout=15))["data"]
body = {"scope": "network" if args.bridge == "network" else "bridge", "question": "维修养护建议", "answerMode": args.mode}
if args.bridge != "network":
    body["bridgeId"] = args.bridge
request = urllib.request.Request(base + "agent/ask", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", csrf["headerName"]: csrf["token"]})
started = time.monotonic()
events, timings = [], {}
event = ""
with opener.open(request, timeout=190) as response:
    for raw in response:
        line = raw.decode("utf-8").strip()
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data = json.loads(line[5:])
            elapsed = round(time.monotonic() - started, 3)
            events.append({"event": event, "data": data})
            if event in ["plan", "evidence", "source", "done", "error"]:
                timings[event] = elapsed
                print(event, elapsed, flush=True)
            if event in ["delta", "replace"] and "firstText" not in timings:
                timings["firstText"] = elapsed
                print("firstText", elapsed, flush=True)
result = {"request": body, "timings": timings, "events": events}
def evidence(capture):
    value = next(e["data"] for e in capture["events"] if e["event"] == "evidence")
    # These describe when/how the evidence was obtained, not business facts.
    return {**value, "data": {k: v for k, v in value["data"].items() if k not in ["查询时间", "资料缓存"]}}
if args.compare:
    earlier = json.loads(Path(args.compare).read_text(encoding="utf-8"))
    result["evidenceEqual"] = evidence(earlier) == evidence(result)
    result["visualizationEqual"] = (
        [e["data"] for e in earlier["events"] if e["event"] == "visualization"]
        == [e["data"] for e in events if e["event"] == "visualization"]
    )
    print("evidenceEqual", result["evidenceEqual"], flush=True)
    print("visualizationEqual", result["visualizationEqual"], flush=True)
output = Path(__file__).resolve().parents[1] / "runtime" / ("maintenance-benchmark-" + args.label + ".json")
output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
assert "done" in timings and "error" not in timings
if args.mode == "auto":
    assert [e["data"]["engine"] for e in events if e["event"] == "source"] == ["model"]
if args.compare:
    assert result["evidenceEqual"], "Business evidence changed"
    assert result["visualizationEqual"], "Chart facts changed"
