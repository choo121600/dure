#!/usr/bin/env python3
"""Tests for dure-sync.py --plan (pure, no gh / no network).

Covers idempotent planning: empty map -> create all; full map -> empty; partial -> missing only.
Run: python3 tests/test_dure_sync.py   (exit 0 = all pass)
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SYNC = os.path.join(REPO, "scripts", "dure-sync.py")

PASS = 0
FAIL = 0


def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def item(base, kind, iid, **extra):
    fm = [f"id: {iid}", f"slug: {iid}", f"type: {kind[:-1]}", f"title: {iid.upper()}",
          "status: todo", "github: null"]
    fm += [f"{k}: {v}" for k, v in extra.items()]
    w(os.path.join(base, ".dure", "roadmap", kind, f"{iid}.md"),
      "---\n" + "\n".join(fm) + "\n---\nb\n")


def make(base, mp=None):
    d = os.path.join(base, ".dure")
    for sub in ("roadmap/milestones", "roadmap/epics", "roadmap/issues", "sync"):
        os.makedirs(os.path.join(d, sub), exist_ok=True)
    item(base, "milestones", "m1", epics="[e1]")
    item(base, "epics", "e1", milestone="m1", issues="[i1]")
    item(base, "issues", "i1", milestone="m1", epic="e1", acceptance="[ok]")
    if mp is not None:
        w(os.path.join(d, "sync", "github-map.json"), json.dumps(mp))
    return base


def plan(root):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=root)
    p = subprocess.run([sys.executable, SYNC], capture_output=True, text=True, env=env)
    return p.returncode, json.loads(p.stdout)


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}  -- {detail}")


def main():
    # empty map -> create all
    with tempfile.TemporaryDirectory() as t:
        make(t)
        ec, d = plan(t)
        check("plan exit=0", ec == 0, ec)
        check("mode=plan", d.get("mode") == "plan")
        check("creates 1 milestone", d["summary"]["milestones"] == 1, d["summary"])
        check("creates 1 epic", d["summary"]["epics"] == 1, d["summary"])
        check("creates 1 issue", d["summary"]["issues"] == 1, d["summary"])
        check("issue carries acceptance", d["create"]["issues"][0]["acceptance"] == ["ok"],
              d["create"]["issues"][0])

    # full map -> empty (idempotent)
    with tempfile.TemporaryDirectory() as t:
        make(t, mp={"milestones": {"m1": 1}, "epics": {"e1": 2}, "issues": {"i1": 3}})
        _, d = plan(t)
        check("full map -> empty plan", d["summary"] == {"milestones": 0, "epics": 0, "issues": 0}, d["summary"])

    # partial map (milestone only) -> only epic+issue remain
    with tempfile.TemporaryDirectory() as t:
        make(t, mp={"milestones": {"m1": 1}, "epics": {}, "issues": {}})
        _, d = plan(t)
        check("partial: 0 milestones", d["summary"]["milestones"] == 0, d["summary"])
        check("partial: 1 epic", d["summary"]["epics"] == 1, d["summary"])
        check("partial: 1 issue", d["summary"]["issues"] == 1, d["summary"])

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
