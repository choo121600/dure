#!/usr/bin/env python3
"""Tests for dure-audit.py.

Scaffold scope (issue i2.1.1): config-default resolution, severity/fail_on exit logic, JSON shape.
The per-check tests (i2.1.2-4) and the full AC-a/b/c + dure-doctor disjointness (i2.1.5) are added
in their own PRs. Run: python3 tests/test_dure_audit.py   (exit 0 = all pass)
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
AUDIT = os.path.join(REPO, "scripts", "dure-audit.py")

# Load the hyphenated script as a module to unit-test its pure functions.
_spec = importlib.util.spec_from_file_location("dure_audit", AUDIT)
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)

PASS = 0
FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}  -- {detail}")


def run(root, *args):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=root)
    p = subprocess.run([sys.executable, AUDIT, *args], capture_output=True, text=True, env=env)
    try:
        return p.returncode, json.loads(p.stdout)
    except Exception:
        return p.returncode, {"_stdout": p.stdout, "_stderr": p.stderr}


def main():
    # --- unit: compute_exit (severity/fail_on logic) ---
    ce = audit.compute_exit
    check("empty findings -> 0", ce([], "error") == 0)
    check("warning < fail_on=error -> 0", ce([{"severity": "warning"}], "error") == 0)
    check("warning >= fail_on=warning -> 1", ce([{"severity": "warning"}], "warning") == 1)
    check("error >= fail_on=error -> 1", ce([{"severity": "error"}], "error") == 1)
    check("info >= fail_on=info -> 1", ce([{"severity": "info"}], "info") == 1)
    check("highest severity wins", ce([{"severity": "info"}, {"severity": "error"}], "warning") == 1)

    # --- unit: resolve_config defaults when no audit: section (committed repo's case) ---
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, ".dure"))
        with open(os.path.join(t, ".dure/config.yml"), "w") as f:
            f.write("interview:\n  min_rounds: 1\ngithub:\n  sync: gh\n")
        cfg = audit.resolve_config(t)
        check("default untested_allowlist=[dure-gate]", cfg["untested_allowlist"] == ["dure-gate"], cfg)
        check("default fail_on=error", cfg["fail_on"] == "error", cfg)

    # --- unit: resolve_config honors an audit: section ---
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, ".dure"))
        with open(os.path.join(t, ".dure/config.yml"), "w") as f:
            f.write("audit:\n  untested_allowlist: [foo, bar]\n  fail_on: warning\n")
        cfg = audit.resolve_config(t)
        check("override untested_allowlist", cfg["untested_allowlist"] == ["foo", "bar"], cfg)
        check("override fail_on=warning", cfg["fail_on"] == "warning", cfg)

    # --- unit: malformed/invalid audit values fall back to defaults ---
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, ".dure"))
        with open(os.path.join(t, ".dure/config.yml"), "w") as f:
            f.write("audit:\n  fail_on: bogus\n  untested_allowlist: notalist\n")
        cfg = audit.resolve_config(t)
        check("invalid fail_on -> default error", cfg["fail_on"] == "error", cfg)
        check("non-list allowlist -> default", cfg["untested_allowlist"] == ["dure-gate"], cfg)

    # --- unit: a raising check propagates (main() maps this to status=error/exit 2) ---
    def _boom(root, cfg):
        raise RuntimeError("boom")
    audit.CHECKS.append(_boom)
    try:
        raised = False
        try:
            audit.run_checks(".", {})
        except RuntimeError:
            raised = True
        check("run_checks propagates check exceptions", raised)
    finally:
        audit.CHECKS.pop()

    # --- integration: clean run, JSON shape, exit 0 (no checks registered yet) ---
    with tempfile.TemporaryDirectory() as t:
        ec, d = run(t)
        check("scaffold exit=0", ec == 0, ec)
        check("JSON shape {status,counts,findings}",
              all(k in d for k in ("status", "counts", "findings")), d)
        check("status=pass on clean", d.get("status") == "pass", d)
        check("findings empty for scaffold", d.get("findings") == [], d)

    # --- integration: --debug-config prints resolved defaults ---
    with tempfile.TemporaryDirectory() as t:
        ec, d = run(t, "--debug-config")
        check("debug-config exit=0", ec == 0, ec)
        check("debug-config shows defaults",
              d.get("audit", {}).get("fail_on") == "error", d)

    # --- integration: runs on the committed repo without error ---
    ec, d = run(REPO)
    check("runs on committed repo (exit 0, valid shape)",
          ec == 0 and "findings" in d, (ec, d))

    # --- check i2.1.2: todo-marker ---
    ec, d = run(REPO)
    repo_tm = [f for f in d["findings"] if f["check"] == "todo-marker"]
    check("todo-marker: 0 on committed repo (no real markers; self-source clean)", repo_tm == [], repo_tm)
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "scripts"))
        with open(os.path.join(t, "scripts/x.py"), "w") as f:
            f.write("# " + "TO" + "DO: wire this up\nprint(1)\n")
        ec, d = run(t)
        tm = [f for f in d["findings"] if f["check"] == "todo-marker"]
        check("todo-marker: finds planted marker", len(tm) == 1, d["findings"])
        check("todo-marker: severity=info + file:line",
              bool(tm) and tm[0]["severity"] == "info"
              and tm[0]["file"] == "scripts/x.py" and tm[0]["line"] == 1, tm)
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "scripts"))
        with open(os.path.join(t, "scripts/y.py"), "w") as f:
            f.write("status = 'todo'  # lowercase is not a marker\n")
        ec, d = run(t)
        check("todo-marker: lowercase 'todo' ignored (case-sensitive)",
              [f for f in d["findings"] if f["check"] == "todo-marker"] == [], d["findings"])

    # FIXME + nested subdir + multi-match + extension filtering
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "scripts", "sub"))
        os.makedirs(os.path.join(t, "docs"))
        with open(os.path.join(t, "scripts/sub/z.py"), "w") as f:
            f.write("# " + "FIX" + "ME: nested\nx = 1  # " + "TO" + "DO: second line\n")
        with open(os.path.join(t, "docs/skip.toml"), "w") as f:
            f.write("# " + "TO" + "DO: ignored (extension not scanned)\n")
        ec, d = run(t)
        tm = [f for f in d["findings"] if f["check"] == "todo-marker"]
        check("todo-marker: FIXME + subdir + multi-match -> 2", len(tm) == 2, tm)
        check("todo-marker: nested subdir path reported",
              any(f["file"] == "scripts/sub/z.py" for f in tm), tm)
        check("todo-marker: non-SCAN_EXT (.toml) skipped",
              all(not f["file"].endswith(".toml") for f in tm), tm)

    # --- check i2.1.3: untested-script ---
    ec, d = run(REPO)
    us = [f for f in d["findings"] if f["check"] == "untested-script"]
    check("untested-script: 0 on committed repo (gate allowlisted, others tested)", us == [], us)
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "scripts"))
        os.makedirs(os.path.join(t, "tests"))
        open(os.path.join(t, "scripts/dure-foo.py"), "w").close()
        ec, d = run(t)
        us = [f for f in d["findings"] if f["check"] == "untested-script"]
        check("untested-script: flags dure-foo.py (warning)",
              len(us) == 1 and us[0]["severity"] == "warning", us)
        check("untested-script: message names test_dure_foo.py",
              bool(us) and "test_dure_foo.py" in us[0]["message"], us)
    with tempfile.TemporaryDirectory() as t:  # allowlisted -> skipped
        os.makedirs(os.path.join(t, "scripts"))
        os.makedirs(os.path.join(t, ".dure"))
        open(os.path.join(t, "scripts/dure-foo.py"), "w").close()
        with open(os.path.join(t, ".dure/config.yml"), "w") as f:
            f.write("audit:\n  untested_allowlist: [dure-foo]\n")
        ec, d = run(t)
        check("untested-script: allowlist skips it",
              [f for f in d["findings"] if f["check"] == "untested-script"] == [], d["findings"])
    with tempfile.TemporaryDirectory() as t:  # hyphen->underscore mapping satisfies
        os.makedirs(os.path.join(t, "scripts"))
        os.makedirs(os.path.join(t, "tests"))
        open(os.path.join(t, "scripts/dure-foo-bar.py"), "w").close()
        open(os.path.join(t, "tests/test_dure_foo_bar.py"), "w").close()
        ec, d = run(t)
        check("untested-script: hyphen->underscore test satisfies",
              [f for f in d["findings"] if f["check"] == "untested-script"] == [], d["findings"])
    with tempfile.TemporaryDirectory() as t:  # .sh utilities are not flagged (only dure-*.py)
        os.makedirs(os.path.join(t, "scripts"))
        open(os.path.join(t, "scripts/dure-helper.sh"), "w").close()
        ec, d = run(t)
        check("untested-script: .sh utilities ignored",
              [f for f in d["findings"] if f["check"] == "untested-script"] == [], d["findings"])

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
