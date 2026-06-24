#!/usr/bin/env python3
"""Tests for dure-status.py — completion math (I1.5.2) + conflict detection (I1.5.1).

Run: python3 tests/test_dure_status.py   (exit 0 = all pass)
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
STATUS = os.path.join(REPO, "scripts", "dure-status.py")

CONFIG = """interview:
  ambiguity_threshold: 1.0
  min_rounds: 1
  dimension_weights: {problem: 3, scope: 3, acceptance: 3, constraints: 2, edge: 2, stakeholders: 1}
github:
  repo: null
  sync: gh
  epic_as: tracking-issue
"""

PASS = 0
FAIL = 0


def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def item(d, kind, iid, status, **extra):
    fm = [f"id: {iid}", f"slug: {iid}", f"type: {kind[:-1]}", f"title: {iid.upper()}",
          f"status: {status}", "github: null"]
    for k, v in extra.items():
        fm.append(f"{k}: {v}")
    body = "---\n" + "\n".join(fm) + "\n---\nb\n"
    w(os.path.join(d, ".dure", "roadmap", kind, f"{iid}.md"), body)


def make(base, issue_statuses, gh_status=None):
    d = os.path.join(base, ".dure")
    for sub in ("specs", "interview-logs", "roadmap/milestones",
                "roadmap/epics", "roadmap/issues", "sync"):
        os.makedirs(os.path.join(d, sub), exist_ok=True)
    w(os.path.join(d, "config.yml"), CONFIG)
    open(os.path.join(d, "active"), "w").close()
    item(base, "milestones", "m1", "doing", epics="[e1]")
    item(base, "epics", "e1", "doing", milestone="m1", issues="[%s]" % ", ".join(issue_statuses))
    for iid, st in issue_statuses.items():
        item(base, "issues", iid, st, milestone="m1", epic="e1",
             acceptance="[ok]")
    if gh_status is not None:
        w(os.path.join(d, "sync", "github-status.json"), json.dumps(gh_status))
    return base


def run(root):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=root)
    p = subprocess.run([sys.executable, STATUS], capture_output=True, text=True, env=env)
    try:
        return p.returncode, json.loads(p.stdout)
    except Exception:
        return p.returncode, {"_stdout": p.stdout, "_stderr": p.stderr}


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}  -- {detail}")


def main():
    # uninitialized
    with tempfile.TemporaryDirectory() as t:
        ec, d = run(t)
        check("uninitialized exit=2", ec == 2, ec)
        check("uninitialized status", d.get("status") == "uninitialized")

    # completion math: 4 issues, 2 done, 1 blocked, 1 todo => 50%
    with tempfile.TemporaryDirectory() as t:
        make(t, {"i1": "done", "i2": "done", "i3": "blocked", "i4": "todo"})
        ec, d = run(t)
        check("exit=0", ec == 0, (ec, d))
        check("overall total=4", d["overall"]["total"] == 4, d["overall"])
        check("overall completion=50.0", d["overall"]["completion"] == 50.0, d["overall"])
        m1 = next(m for m in d["milestones"] if m["id"] == "m1")
        check("m1 completion=50.0", m1["completion"] == 50.0, m1)
        check("m1 counts done=2", m1["counts"]["done"] == 2, m1["counts"])
        check("blocker i3 reported", any(b["id"] == "i3" for b in d["blockers"]), d["blockers"])
        check("no conflicts (no gh cache)", d["conflicts"] == [], d["conflicts"])

    # all done => 100%
    with tempfile.TemporaryDirectory() as t:
        make(t, {"i1": "done", "i2": "done"})
        _, d = run(t)
        check("all-done completion=100.0", d["overall"]["completion"] == 100.0, d["overall"])

    # conflict detection: i1 local todo but GitHub closed; i2 local done but GitHub open
    with tempfile.TemporaryDirectory() as t:
        make(t, {"i1": "todo", "i2": "done"}, gh_status={"i1": "closed", "i2": "open"})
        _, d = run(t)
        ids = {c["id"] for c in d["conflicts"]}
        check("conflict on i1 (gh closed, local todo)", "i1" in ids, d["conflicts"])
        check("conflict on i2 (local done, gh open)", "i2" in ids, d["conflicts"])

    # no conflict when statuses agree
    with tempfile.TemporaryDirectory() as t:
        make(t, {"i1": "done", "i2": "todo"}, gh_status={"i1": "closed", "i2": "open"})
        _, d = run(t)
        check("no conflict when agreeing", d["conflicts"] == [], d["conflicts"])

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
