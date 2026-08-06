#!/usr/bin/env python3
# build_zip.py - package the project into Compressed/RLScript-Free-<ver>.zip
# for the GitHub release. Embeds build.json (version + git build id) which the
# bridge's self-updater uses to detect a newer build. config.json IS included
# (fresh-install copy with %VAR% placeholders only - never real secrets).
import json
import os
import subprocess
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "Compressed")
SKIP_ROOTS = {".git", "Compressed", "__pycache__", "build_zip.py", "build.json", ".gitignore"}
SKIP_DIRS = {"__pycache__", ".git"}


def main() -> int:
    with open(os.path.join(HERE, "zeroscript-extension", "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    version = manifest["version"]
    try:
        build = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=HERE, text=True
        ).strip()
    except Exception:
        build = "dev"
    build_info = {
        "repo": "RLRasuL/RLScript-Free",
        "version": version,
        "build": build,
        "zip": f"RLScript-Free-{version}.zip",
        "channel": "stable",
    }
    with open(os.path.join(HERE, "build.json"), "w", encoding="utf-8") as fh:
        json.dump(build_info, fh, indent=2)
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, build_info["zip"])
    roots = sorted(
        n for n in os.listdir(HERE)
        if n not in SKIP_ROOTS and os.path.exists(os.path.join(HERE, n))
    )
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(HERE, "build.json"), "build.json")
        for root in roots:
            full_root = os.path.join(HERE, root)
            if os.path.isfile(full_root):
                zf.write(full_root, root)
                continue
            for base, dirs, files in os.walk(full_root):
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                for f in files:
                    full = os.path.join(base, f)
                    rel = os.path.relpath(full, HERE).replace(os.sep, "/")
                    zf.write(full, rel)
    print(f"built {out} (v{version}, build {build})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
