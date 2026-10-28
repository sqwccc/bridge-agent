"""Format maintained project code through IntelliJ IDEA MCP, preserving a receipt."""
import argparse
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:64343/stream")
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location("idea_mcp", ROOT / "scripts/idea-mcp.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    client = module.IdeaMcp(args.url)
    files = set()
    for folder in ("backend/src", "frontend/src", "frontend/e2e", "scripts"):
        files.update(p for p in (ROOT / folder).rglob("*") if p.is_file() and p.suffix in {".java", ".xml", ".yml", ".ts", ".tsx", ".css", ".py", ".ps1"})
    for folder in (ROOT, ROOT / "backend", ROOT / "frontend"):
        files.update(p for p in folder.iterdir() if p.is_file() and p.suffix in {".xml", ".json", ".yml", ".yaml", ".ts", ".html"} and p.name != "pnpm-lock.yaml")
    files = sorted(files)
    before = {str(p.relative_to(ROOT)).replace("\\", "/"): digest(p) for p in files}
    receipt = {"formattedAt": datetime.now(timezone.utc).isoformat(), "server": args.url, "files": list(before), "results": []}
    for offset in range(0, len(files), 25):
        batch = [str(p.relative_to(ROOT)).replace("\\", "/") for p in files[offset:offset + 25]]
        result = client.request("tools/call", {"name": "reformat_file", "arguments": {"files": batch, "projectPath": str(ROOT)}})
        receipt["results"].append(result)
        print(f"IDEA MCP reformat_file: {offset + len(batch)}/{len(files)}", flush=True)
        if result.get("error") or result.get("result", {}).get("isError"):
            (ROOT / "runtime/phase-three-formatting.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
            raise RuntimeError("IDEA formatting returned an error; inspect the formatting receipt")
    receipt["changedFiles"] = [str(p.relative_to(ROOT)).replace("\\", "/") for p in files if before[str(p.relative_to(ROOT)).replace("\\", "/")] != digest(p)]
    (ROOT / "runtime/phase-three-formatting.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"files": len(files), "changed": len(receipt["changedFiles"]), "errors": 0}))


if __name__ == "__main__":
    main()
