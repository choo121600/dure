#!/usr/bin/env python3
"""Tests for dure-doctor.py — covers AC-a/b/c from .dure/specs/dure-doctor.md.

Run: python3 tests/test_dure_doctor.py   (exit 0 = all pass)
No third-party deps; builds .dure/ fixtures in temp dirs.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DOCTOR = os.path.join(REPO, "scripts", "dure-doctor.py")

CONFIG = """interview:
  ambiguity_threshold: 1.0
  min_rounds: 1
  dimension_weights:
    problem: 3
    scope: 3
    acceptance: 3
    constraints: 2
    edge: 2
    stakeholders: 1
github:
  repo: null
  sync: gh
  epic_as: tracking-issue
roadmap:
  id_prefix: ""
"""

M1 = "---\nid: m1\nslug: m-one\ntype: milestone\ntitle: M\nstatus: todo\ngithub: null\nepics: [e1]\n---\nbody\n"
E1 = "---\nid: e1\nslug: e-one\ntype: epic\ntitle: E\nstatus: todo\ngithub: null\nmilestone: m1\nissues: [i1]\n---\nbody\n"
I1 = ("---\nid: i1\nslug: i-one\ntype: issue\ntitle: I\nstatus: todo\ngithub: null\n"
      "milestone: m1\nepic: e1\nacceptance:\n  - Given X When Y Then Z\n---\nbody\n")

PASS = 0
FAIL = 0


def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def make_valid(base):
    d = os.path.join(base, ".dure")
    for sub in ("specs", "interview-logs", "roadmap/milestones",
                "roadmap/epics", "roadmap/issues", "sync"):
        os.makedirs(os.path.join(d, sub), exist_ok=True)
    w(os.path.join(d, "config.yml"), CONFIG)
    open(os.path.join(d, "active"), "w").close()
    w(os.path.join(d, "roadmap/milestones/m1.md"), M1)
    w(os.path.join(d, "roadmap/epics/e1.md"), E1)
    w(os.path.join(d, "roadmap/issues/i1.md"), I1)
    return base


def run(root, *args):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=root)
    p = subprocess.run([sys.executable, DOCTOR, *args],
                       capture_output=True, text=True, env=env)
    try:
        data = json.loads(p.stdout)
    except Exception:
        data = {"_stdout": p.stdout, "_stderr": p.stderr}
    return p.returncode, data


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}  -- {detail}")


def shape_ok(d):
    return all(k in d for k in ("status", "checks_passed", "checks_failed", "violations", "warnings"))


def has_violation(d, prefix):
    return any(v["check"].startswith(prefix) for v in d.get("violations", []))


def ac_a():
    print("AC-a: fixtures -> exact JSON shape + exit codes")
    with tempfile.TemporaryDirectory() as t:
        ec, d = run(t)
        check("uninitialized exit=2", ec == 2, ec)
        check("uninitialized status", d.get("status") == "uninitialized", d)
        check("uninitialized shape", shape_ok(d))
    with tempfile.TemporaryDirectory() as t:
        make_valid(t)
        ec, d = run(t)
        check("valid-full exit=0", ec == 0, (ec, d.get("violations")))
        check("valid-full status=pass", d.get("status") == "pass", d.get("violations"))
        check("valid-full shape", shape_ok(d))

    def mk_badconfig(t):
        make_valid(t)
        w(os.path.join(t, ".dure/config.yml"), CONFIG.replace("sync: gh", "sync: bogus"))
        return "config:github.sync"

    def mk_dangling(t):
        make_valid(t)
        with open(os.path.join(t, ".dure/active"), "w") as f:
            f.write("nope")
        return "active:dangling"

    def mk_orphan(t):
        make_valid(t)
        p = os.path.join(t, ".dure/roadmap/issues/i1.md")
        w(p, open(p).read().replace("epic: e1", "epic: e9"))
        return "hier:i1:epic"

    def mk_emptyacc(t):
        make_valid(t)
        p = os.path.join(t, ".dure/roadmap/issues/i1.md")
        w(p, open(p).read().replace("acceptance:\n  - Given X When Y Then Z\n", "acceptance: []\n"))
        return "item:acceptance"

    def mk_badmap(t):
        make_valid(t)
        w(os.path.join(t, ".dure/sync/github-map.json"), "{ not json ")
        return "github-map:json"

    for name, mk in (("bad-config-enum", mk_badconfig), ("dangling-active", mk_dangling),
                     ("orphan-epic", mk_orphan), ("empty-acceptance", mk_emptyacc),
                     ("malformed-github-map", mk_badmap)):
        with tempfile.TemporaryDirectory() as t:
            prefix = mk(t)
            ec, d = run(t)
            check(f"{name}: exit=1", ec == 1, (ec, d))
            check(f"{name}: status=fail", d.get("status") == "fail", d)
            check(f"{name}: reports {prefix}", has_violation(d, prefix), d.get("violations"))


def ac_b():
    print("AC-b: zero false-positive violations on the committed .dure/")
    ec, d = run(REPO)
    check("real .dure exit=0", ec == 0, (ec, d.get("violations")))
    check("real .dure status=pass", d.get("status") == "pass", d.get("violations"))
    check("real .dure no error violations", len(d.get("violations", [])) == 0, d.get("violations"))
    check("real .dure has warnings (expected)", len(d.get("warnings", [])) >= 1)


def ac_c():
    print("AC-c: --fix touches only missing dirs + empty .dure/active")
    with tempfile.TemporaryDirectory() as t:
        make_valid(t)
        d = os.path.join(t, ".dure")
        shutil.rmtree(os.path.join(d, "sync"))
        protected = [os.path.join(d, "config.yml"),
                     os.path.join(d, "roadmap/milestones/m1.md"),
                     os.path.join(d, "roadmap/epics/e1.md"),
                     os.path.join(d, "roadmap/issues/i1.md")]
        before = {p: hashlib.sha256(open(p, "rb").read()).hexdigest() for p in protected}
        active_before = open(os.path.join(d, "active"), "rb").read()
        ec, data = run(t, "--fix")
        check("missing dir recreated", os.path.isdir(os.path.join(d, "sync")))
        after = {p: hashlib.sha256(open(p, "rb").read()).hexdigest() for p in protected}
        check("protected files byte-identical", before == after,
              [os.path.basename(p) for p in protected if before[p] != after[p]])
        check("active unchanged", open(os.path.join(d, "active"), "rb").read() == active_before)
        check("fixed list reported", "fixed" in data and len(data["fixed"]) >= 1, data.get("fixed"))
    with tempfile.TemporaryDirectory() as t:
        ec, data = run(t, "--fix")
        check("fix uninitialized creates .dure", os.path.isdir(os.path.join(t, ".dure")))
        check("fix creates empty active", os.path.isfile(os.path.join(t, ".dure/active")))
        check("fix does NOT fabricate config (exit=1)", ec == 1, ec)


if __name__ == "__main__":
    ac_a()
    ac_b()
    ac_c()
    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)
