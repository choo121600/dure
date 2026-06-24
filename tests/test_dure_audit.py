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

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
