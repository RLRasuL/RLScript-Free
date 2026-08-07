#!/usr/bin/env python3
# build_zip.py - package the project into Compressed/RLScript-Free-<ver>.zip
# for the GitHub release. Embeds build.json (version + git build id + per-file
# sha256 manifest) which the bridge's self-updater uses to detect a newer build
# and to rewrite ONLY changed files. A copy of build.json is also written into
# rlscript-extension/ (the extension's own build marker, readable via
# chrome.runtime.getURL("build.json")) and into Compressed/ so it can be
# uploaded alongside the zip as the tiny release asset the extension-side
# updater reads. config.json IS included (fresh-install copy with %VAR%
# placeholders only - never real secrets).
import hashlib
import json
import os
import subprocess
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "Compressed")
EXT_DIR = os.path.join(HERE, "rlscript-extension")
SKIP_ROOTS = {".git", "Compressed", "__pycache__", "build_zip.py", "build.json", ".gitignore", "assets", "logs"}
SKIP_DIRS = {"__pycache__", ".git"}


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def _collect():
    """(relpath, abspath) for every file that ships, sorted for determinism."""
    files = []
    for n in sorted(os.listdir(HERE)):
        if n in SKIP_ROOTS:
            continue
        full = os.path.join(HERE, n)
        if os.path.isfile(full):
            files.append((n, full))
            continue
        for base, dirs, names in os.walk(full):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in sorted(names):
                full2 = os.path.join(base, f)
                files.append((os.path.relpath(full2, HERE).replace(os.sep, "/"), full2))
    return files


def main() -> int:
    with open(os.path.join(EXT_DIR, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    version = manifest["version"]
    try:
        build = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=HERE, text=True
        ).strip()
    except Exception:
        build = "dev"
    # The extension's own marker (small - the extension reads only `build`).
    # Written BEFORE collecting so it ships in the zip and its hash lands in
    # the root manifest.
    ext_marker = {
        "repo": "RLRasuL/RLScript-Free",
        "version": version,
        "build": build,
        "channel": "stable",
    }
    os.makedirs(EXT_DIR, exist_ok=True)
    with open(os.path.join(EXT_DIR, "build.json"), "w", encoding="utf-8") as fh:
        json.dump(ext_marker, fh, indent=2)
    os.makedirs(OUT_DIR, exist_ok=True)
    # Standalone copy for the release asset (extension-side updater reads it).
    with open(os.path.join(OUT_DIR, "build.json"), "w", encoding="utf-8") as fh:
        json.dump(ext_marker, fh, indent=2)
    files = _collect()
    hashes = {rel: _sha256(abs) for rel, abs in files}
    build_info = {
        "repo": "RLRasuL/RLScript-Free",
        "version": version,
        "build": build,
        "zip": f"RLScript-Free-{version}.zip",
        "channel": "stable",
        "files": hashes,
    }
    with open(os.path.join(HERE, "build.json"), "w", encoding="utf-8") as fh:
        json.dump(build_info, fh, indent=2)
    out = os.path.join(OUT_DIR, build_info["zip"])
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(HERE, "build.json"), "build.json")
        for rel, abs in files:
            zf.write(abs, rel)
    print(f"built {out} (v{version}, build {build}, {len(files)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
