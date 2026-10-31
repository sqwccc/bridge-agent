"""Update only pre_prompt in checked-in Dify DSLs; never touch model credentials/config.

The replacement uses a JSON-quoted YAML scalar, preserving every other byte in the DSL.
By default no service calls; --apply-local updates only existing app prompts.
"""
import json
import re
import argparse
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sync(path, prompt):
    text = path.read_text(encoding="utf-8-sig")
    match = re.search(r"(?m)^  pre_prompt:.*(?:\n(?!  [a-zA-Z_][\w-]*:|[^\s]).*)*", text)
    if not match:
        raise ValueError(f"No model_config.pre_prompt in {path.name}")
    updated = text[:match.start()] + "  pre_prompt: " + json.dumps(prompt, ensure_ascii=False) + text[match.end():]
    path.write_text(updated, encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply-local", action="store_true", help="Update existing local Dify app prompts only")
    args = parser.parse_args()
    for name, role in [("dify-classifier-app.yml", "classifier"), ("dify-bridge-app.yml", "answer")]:
        sync(ROOT / "docs" / name, (ROOT / "docs" / f"dify-{role}-prompt.txt").read_text(encoding="utf-8-sig"))
    print("Synced classifier and answer prompts; provider settings preserved.")
    if args.apply_local:
        spec = importlib.util.spec_from_file_location("dify_configurer", ROOT / "scripts/configure-dify.py")
        configurer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(configurer)
        try:
            state = configurer.login()
            for role, id_key in [("classifier", "classifier_app_id"), ("answer", "app_id")]:
                app_id = state[id_key]
                config = configurer.call("/apps/" + app_id)["model_config"]
                backup = ROOT / "runtime" / f"dify-before-qa-enhancement-{role}.json"
                if not backup.exists():
                    backup.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
                config["pre_prompt"] = (ROOT / "docs" / f"dify-{role}-prompt.txt").read_text(encoding="utf-8-sig")
                configurer.call("/apps/" + app_id + "/model-config", config)
            print("Updated existing local Dify prompts; models, credentials and other settings preserved.")
        except Exception as error:
            raise SystemExit("Local Dify update failed: " + type(error).__name__ + ". Check service availability; no credentials logged.") from None
