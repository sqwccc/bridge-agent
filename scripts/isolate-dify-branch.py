"""Create branch-owned Dify apps; preserve original IDs, keys and non-prompt settings.

Local state and backups contain secrets and live only in ignored runtime/.
"""
import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def branch():
    return subprocess.check_output(["git", "-c", "safe.directory=" + ROOT.as_posix(),
                                    "branch", "--show-current"], cwd=ROOT, text=True).strip()


def state_path():
    import hashlib
    return ROOT / "runtime" / ("dify-branch-" + hashlib.sha256(branch().encode()).hexdigest()[:16] + ".json")


def main(restore_original=False):
    spec = importlib.util.spec_from_file_location("configurer", ROOT / "scripts/configure-dify.py")
    c = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(c)
    original = c.login()
    name = branch()
    if not name.startswith("codex/"):
        raise ValueError("Run on the intended codex feature branch")
    path = state_path()
    state = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"branch": name}
    def save():
        path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    for role, id_key, key_key in [("classifier", "classifier_app_id", "classifier_api_key"),
                                  ("answer", "app_id", "app_api_key")]:
        before = ROOT / "runtime" / f"dify-before-qa-enhancement-{role}.json"
        baseline = json.loads(before.read_text(encoding="utf-8"))
        old_id = original[id_key]
        current = c.call("/apps/" + old_id)["model_config"]
        state.setdefault("original_" + id_key, old_id)
        if state["original_" + id_key] != old_id:
            raise ValueError("Original application changed; refusing to restore a different app")
        state.setdefault("before_isolation_" + role, current)
        save()
        if not state.get(id_key):
            app = c.call("/apps", {"name": "BridgeMind " + ("问题分类" if role == "classifier" else "桥梁数据问答") + " [" + name + "]",
                                  "description": "Git分支独立应用：" + name, "mode": "chat",
                                  "icon_type": "emoji", "icon": "🌉", "icon_background": "#D5F5F6"})
            state[id_key] = app["id"]
            save()
        assert state[id_key] != old_id
        config = dict(state["before_isolation_" + role])
        config["pre_prompt"] = (ROOT / "docs" / f"dify-{role}-prompt.txt").read_text(encoding="utf-8-sig")
        c.call("/apps/" + state[id_key] + "/model-config", config)
        if not state.get(key_key):
            state[key_key] = c.call("/apps/" + state[id_key] + "/api-keys", {})["token"]
            save()
        assert c.call("/apps/" + state[id_key])["model_config"]["pre_prompt"] == config["pre_prompt"]
        # Restore only the prompt changed by our synchronization, not user model settings.
        if restore_original and not state.get("restored_" + role):
            current["pre_prompt"] = baseline["pre_prompt"]
            c.call("/apps/" + old_id + "/model-config", current)
            restored = c.call("/apps/" + old_id)["model_config"]
            assert restored["pre_prompt"] == baseline["pre_prompt"]
            assert restored["model"] == current["model"]
            state["restored_" + role] = True
            save()
        print(role + ": independent app ready; original application preserved")
    print("Branch mapping saved locally; original account and .env.local are unchanged.")


if __name__ == "__main__":
    try:
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--restore-original-prompts", action="store_true", help="One-time recovery from the QA enhancement backups")
        main(parser.parse_args().restore_original_prompts)
    except Exception as error:
        raise SystemExit("Dify isolation failed: " + type(error).__name__ + "; local state retained for safe retry.") from None
