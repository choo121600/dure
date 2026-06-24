#!/usr/bin/env python3
"""Tests for dure-index.py (I1.3.2) — generation, hierarchy, idempotency, doctor-clean.

Run: python3 tests/test_dure_index.py   (exit 0 = all pass)
"""
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
INDEX = os.path.join(REPO, "scripts", "dure-index.py")
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
M1 = "---\nid: m1\nslug: m-one\ntype: milestone\ntitle: Mile One\nstatus: doing\ngithub: null\nepics: [e1]\n---\nb\n"
E1 = "---\nid: e1\nslug: e-one\ntype: epic\ntitle: Epic One\nstatus: todo\ngithub: null\nmilestone: m1\nissues: [i1]\n---\nb\n"
I1 = ("---\nid: i1\nslug: i-one\ntype: issue\ntitle: Issue One\nstatus: done\ngithub: null\n"
      "milestone: m1\nepic: e1\nacceptance:\n  - Given X When Y Then Z\n---\nb\n")

PASS = 0
FAIL = 0


def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def make_roadmap(base):
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


def run(script, root, *args):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=root)
    return subprocess.run([sys.executable, script, *args],
                          capture_output=True, text=True, env=env)


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}  -- {detail}")


def main():
    with tempfile.TemporaryDirectory() as t:
        make_roadmap(t)
        idx = os.path.join(t, ".dure/roadmap/index.md")

        r = run(INDEX, t)
        check("generator exit=0", r.returncode == 0, r.stderr)
        check("index.md created", os.path.isfile(idx))
        body = open(idx, encoding="utf-8").read()
        check("has GENERATED marker", body.startswith("<!-- GENERATED"))
        check("lists m1/e1/i1", all(x in body for x in ("**m1**", "**e1**", "**i1**")), body)
        check("status markers present", "`doing`" in body and "`done`" in body, body)

        # hierarchy indentation: epic indented under milestone, issue under epic
        lines = {ln.strip(): ln for ln in body.splitlines() if "**" in ln}
        m_indent = len(lines["- ◐ **m1** Mile One · `doing`"]) - len(lines["- ◐ **m1** Mile One · `doing`"].lstrip())
        e_line = next(v for k, v in lines.items() if "**e1**" in k)
        i_line = next(v for k, v in lines.items() if "**i1**" in k)
        check("epic indented under milestone", (len(e_line) - len(e_line.lstrip())) > m_indent, e_line)
        check("issue indented under epic",
              (len(i_line) - len(i_line.lstrip())) > (len(e_line) - len(e_line.lstrip())), i_line)

        # idempotency: re-run -> byte-identical
        first = open(idx, "rb").read()
        run(INDEX, t)
        check("idempotent (byte-identical)", open(idx, "rb").read() == first)

        # doctor still clean after generating index
        dr = run(DOCTOR, t)
        check("doctor exit=0 after index", dr.returncode == 0, dr.stdout)

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
