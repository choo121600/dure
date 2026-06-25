#!/usr/bin/env python3
"""Tests for dure-survey.py scaffold (i3.1.1) — JSON/exit contract, survey config defaults,
robust loaders, and the empty-project / malformed-front-matter edges.

Signals (closable-milestone i3.1.2, empty-epic i3.1.3) are tested in their own additions; this
file fixes the scaffold contract. Run: python3 tests/test_dure_survey.py   (exit 0 = all pass)
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SURVEY = os.path.join(REPO, "scripts", "dure-survey.py")

CONFIG_NO_SURVEY = """interview:
  ambiguity_threshold: 1.0
  min_rounds: 1
github:
  repo: null
  sync: gh
"""

CONFIG_SURVEY_INFO = CONFIG_NO_SURVEY + """survey:
  fail_on: info
"""

PASS = 0
FAIL = 0


def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def mkitem(base, kind, iid, status, **extra):
    """Write a per-item roadmap file. extra values are emitted verbatim (e.g. epics='[e1]')."""
    fm = [f"id: {iid}", f"slug: {iid}", f"type: {kind[:-1]}", f"title: {iid.upper()}",
          f"status: {status}", "github: null"]
    for k, v in extra.items():
        fm.append(f"{k}: {v}")
    w(os.path.join(base, ".dure", "roadmap", kind, f"{iid}.md"),
      "---\n" + "\n".join(fm) + "\n---\nbody\n")


def closable_ids(d):
    return sorted(f["id"] for f in d.get("findings", []) if f["check"] == "closable-milestone")


def load_module():
    spec = importlib.util.spec_from_file_location("dure_survey", SURVEY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run(root, *args):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=root)
    p = subprocess.run([sys.executable, SURVEY, *args],
                       capture_output=True, text=True, env=env)
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


def make_repo(base, config=CONFIG_NO_SURVEY, with_roadmap=True):
    d = os.path.join(base, ".dure")
    subs = ["specs", "interview-logs", "sync"]
    if with_roadmap:
        subs += ["roadmap/milestones", "roadmap/epics", "roadmap/issues"]
    for sub in subs:
        os.makedirs(os.path.join(d, sub), exist_ok=True)
    w(os.path.join(d, "config.yml"), config)
    open(os.path.join(d, "active"), "w").close()
    return base


def main():
    mod = load_module()

    # ---- contract on the committed repo: scaffold has no signals -> zero findings, exit 0 ----
    ec, d = run(REPO)
    check("committed: exit=0", ec == 0, (ec, d))
    check("committed: status=pass", d.get("status") == "pass", d)
    check("committed: JSON shape {status,counts,findings}",
          set(["status", "counts", "findings"]).issubset(d.keys()), list(d.keys()))
    check("committed: counts.findings is int", isinstance(d.get("counts", {}).get("findings"), int), d)
    check("committed: zero findings (no signals yet)", d.get("counts", {}).get("findings") == 0, d)
    check("committed: findings is a list", isinstance(d.get("findings"), list), d)

    # ---- config: defaults applied when no survey section ----
    with tempfile.TemporaryDirectory() as t:
        make_repo(t, config=CONFIG_NO_SURVEY)
        ec, d = run(t, "--debug-config")
        check("config default fail_on=error", d.get("survey", {}).get("fail_on") == "error", d)
        check("--debug-config exit=0", ec == 0, ec)

    # ---- config: survey section override ----
    with tempfile.TemporaryDirectory() as t:
        make_repo(t, config=CONFIG_SURVEY_INFO)
        _, d = run(t, "--debug-config")
        check("config override fail_on=info", d.get("survey", {}).get("fail_on") == "info", d)

    # ---- empty/new project: .dure present but no roadmap dir -> 0 findings, exit 0 ----
    with tempfile.TemporaryDirectory() as t:
        make_repo(t, with_roadmap=False)
        ec, d = run(t)
        check("empty-project exit=0", ec == 0, (ec, d))
        check("empty-project status=pass", d.get("status") == "pass", d)
        check("empty-project zero findings", d.get("counts", {}).get("findings") == 0, d)

    # ---- completely bare dir (no .dure at all): must not crash ----
    with tempfile.TemporaryDirectory() as t:
        ec, d = run(t)
        check("bare-dir exit=0", ec == 0, (ec, d))
        check("bare-dir status=pass (not error)", d.get("status") == "pass", d)

    # ---- malformed front matter: the item is silently skipped, run does not crash ----
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        # valid milestone + an issue whose YAML front matter is broken (unclosed flow seq)
        w(os.path.join(t, ".dure", "roadmap", "milestones", "m1.md"),
          "---\nid: m1\nslug: m1\ntype: milestone\ntitle: M1\nstatus: doing\n---\nx\n")
        w(os.path.join(t, ".dure", "roadmap", "issues", "i1.md"),
          "---\nid: i1\nlabels: [unclosed, broken\nstatus: : :\n---\nx\n")
        ec, d = run(t)
        check("malformed-fm exit=0 (no crash)", ec == 0, (ec, d))
        check("malformed-fm status=pass (no error, no integrity finding)",
              d.get("status") == "pass", d)
        check("malformed-fm zero findings", d.get("counts", {}).get("findings") == 0, d)

    # ---- unit: compute_exit honors fail_on threshold ----
    check("compute_exit info<error -> 0", mod.compute_exit([{"severity": "info"}], "error") == 0)
    check("compute_exit info>=info -> 1", mod.compute_exit([{"severity": "info"}], "info") == 1)
    check("compute_exit empty -> 0", mod.compute_exit([], "error") == 0)
    check("compute_exit warning>=error -> 0", mod.compute_exit([{"severity": "warning"}], "error") == 0)
    check("compute_exit error>=error -> 1", mod.compute_exit([{"severity": "error"}], "error") == 1)

    # ---- unit: build_report shape ----
    rep = mod.build_report([{"check": "x", "severity": "info"}], 0)
    check("build_report status=pass when exit 0", rep["status"] == "pass", rep)
    check("build_report counts findings=1", rep["counts"]["findings"] == 1, rep)
    check("build_report counts info=1", rep["counts"].get("info") == 1, rep)
    check("build_report status=fail when exit 1",
          mod.build_report([{"check": "x", "severity": "error"}], 1)["status"] == "fail")

    # ---- unit: loaders ----
    with tempfile.TemporaryDirectory() as t:
        items = mod.load_items(t)  # no .dure at all
        check("load_items bare -> empty dicts",
              items == {"milestones": {}, "epics": {}, "issues": {}}, items)
    with tempfile.TemporaryDirectory() as t:
        bad = os.path.join(t, "bad.md")
        w(bad, "---\nid: i1\nlabels: [unclosed\nstatus: : :\n---\nx\n")
        check("_read_front_matter malformed -> {}", mod._read_front_matter(bad) == {})
        good = os.path.join(t, "good.md")
        w(good, "---\nid: m1\nstatus: done\n---\nx\n")
        fm = mod._read_front_matter(good)
        check("_read_front_matter valid -> id", fm.get("id") == "m1", fm)

    # ---- unit: load_items DROPS a malformed child (AC #4 at the loader level, not vacuously) ----
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        w(os.path.join(t, ".dure", "roadmap", "milestones", "m1.md"),
          "---\nid: m1\nslug: m1\ntype: milestone\ntitle: M1\nstatus: doing\nepics: [e1]\n---\nx\n")
        w(os.path.join(t, ".dure", "roadmap", "issues", "i1.md"),
          "---\nid: i1\nlabels: [unclosed, broken\nstatus: : :\n---\nx\n")
        items = mod.load_items(t)
        check("load_items keeps valid m1", "m1" in items["milestones"], items["milestones"])
        check("load_items DROPS malformed i1 (skipped, not loaded wrong)",
              "i1" not in items["issues"], items["issues"])

    # ---- unit: no-PyYAML fallback parses block lists too (parity with dure-audit) ----
    saved = mod.HAVE_YAML
    try:
        mod.HAVE_YAML = False
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, "blocklist.md")
            w(p, "---\nid: m1\nepics:\n  - e1\n  - e2\nstatus: doing\n---\nx\n")
            fm = mod._read_front_matter(p)
            check("fallback parses block-list epics", fm.get("epics") == ["e1", "e2"], fm)
            check("fallback parses inline scalar after list", fm.get("status") == "doing", fm)
            p2 = os.path.join(t, "inline.md")
            w(p2, "---\nid: m2\nepics: [e1, e2]\n---\nx\n")
            check("fallback parses inline list",
                  mod._read_front_matter(p2).get("epics") == ["e1", "e2"])
    finally:
        mod.HAVE_YAML = saved

    # ============================ closable-milestone (i3.1.2) ============================
    # committed repo: m2 is NOT closable while epics e2.2/e2.3 are doing
    _, d = run(REPO)
    check("committed: closable-milestone = 0", closable_ids(d) == [], closable_ids(d))

    # genuinely closable: milestone doing, epic done, all issues done
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "milestones", "m1", "doing", epics="[e1]")
        mkitem(t, "epics", "e1", "done", milestone="m1", issues="[i1, i2]")
        mkitem(t, "issues", "i1", "done", milestone="m1", epic="e1")
        mkitem(t, "issues", "i2", "done", milestone="m1", epic="e1")
        ec, d = run(t)
        check("closable: m1 reported", closable_ids(d) == ["m1"], (ec, d))
        check("closable: severity info", all(f["severity"] == "info" for f in d["findings"]), d)
        check("closable: exit 0 (info advisory)", ec == 0, ec)

    # NOT closable: an undone descendant epic (even though all issues are done)
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "milestones", "m1", "doing", epics="[e1]")
        mkitem(t, "epics", "e1", "doing", milestone="m1", issues="[i1]")
        mkitem(t, "issues", "i1", "done", milestone="m1", epic="e1")
        _, d = run(t)
        check("not-closable: undone epic blocks", closable_ids(d) == [], d)

    # NOT closable: an undone descendant issue
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "milestones", "m1", "doing", epics="[e1]")
        mkitem(t, "epics", "e1", "done", milestone="m1", issues="[i1, i2]")
        mkitem(t, "issues", "i1", "done", milestone="m1", epic="e1")
        mkitem(t, "issues", "i2", "todo", milestone="m1", epic="e1")
        _, d = run(t)
        check("not-closable: undone issue blocks", closable_ids(d) == [], d)

    # vacuous guard: milestone with zero descendants is never closable
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "milestones", "m1", "doing")
        _, d = run(t)
        check("vacuous: zero-descendant milestone not closable", closable_ids(d) == [], d)

    # done milestone is skipped (not a candidate)
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "milestones", "m1", "done", epics="[e1]")
        mkitem(t, "epics", "e1", "done", milestone="m1", issues="[i1]")
        mkitem(t, "issues", "i1", "done", milestone="m1", epic="e1")
        _, d = run(t)
        check("done-milestone: skipped (not closable)", closable_ids(d) == [], d)

    # epic-only issue attribution (issue has epic but no milestone field) still counts
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "milestones", "m1", "doing", epics="[e1]")
        mkitem(t, "epics", "e1", "done", milestone="m1")  # epic lists no issues
        mkitem(t, "issues", "i1", "done", epic="e1")       # attributed via epic only
        _, d = run(t)
        check("epic-only attribution: m1 closable via union membership",
              closable_ids(d) == ["m1"], d)

    # a referenced child with no backing file keeps the milestone NOT closable (reference-union safety)
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "milestones", "m1", "doing", epics="[e1]")  # e1.md intentionally absent
        _, d = run(t)
        check("missing referenced epic -> not closable", closable_ids(d) == [], d)

    # DISCRIMINATING reference-union safety: a present-done epic AND a missing referenced epic.
    # Correct union oracle -> NOT closable (missing e2 reads not-done). A loaded-only oracle would
    # drop e2 and wrongly fire — so this fixture (unlike the one above) actually catches that regression.
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "milestones", "m1", "doing", epics="[e1, e2]")  # e2.md absent
        mkitem(t, "epics", "e1", "done", milestone="m1", issues="[i1]")
        mkitem(t, "issues", "i1", "done", milestone="m1", epic="e1")
        _, d = run(t)
        check("missing epic among present-done epics -> not closable (union, not loaded-only)",
              closable_ids(d) == [], d)

    # issues-only milestone (zero epics): all issues done -> closable (pins the epics-count==0 path)
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "milestones", "m1", "doing")  # no epics
        mkitem(t, "issues", "i1", "done", milestone="m1")
        mkitem(t, "issues", "i2", "done", milestone="m1")
        _, d = run(t)
        check("issues-only milestone closable when all issues done", closable_ids(d) == ["m1"], d)

    # ============================ empty-epic (i3.1.3) ============================
    def empty_ids(dd):
        return sorted(f["id"] for f in dd.get("findings", []) if f["check"] == "empty-epic")

    # committed repo: every backed epic has >= 1 child issue -> 0
    _, d = run(REPO)
    check("committed: empty-epic = 0", empty_ids(d) == [], empty_ids(d))

    # a truly childless epic (no issues list, no back-refs) -> fires
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "epics", "e1", "todo", milestone="m1")
        ec, d = run(t)
        check("empty-epic: childless epic reported", empty_ids(d) == ["e1"], (ec, d))
        check("empty-epic: severity info & exit 0",
              ec == 0 and all(f["severity"] == "info" for f in d["findings"] if f["check"] == "empty-epic"), (ec, d))

    # epic with a child via its issues list -> no fire
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "epics", "e1", "doing", milestone="m1", issues="[i1]")
        mkitem(t, "issues", "i1", "todo", milestone="m1", epic="e1")
        _, d = run(t)
        check("empty-epic: epic with listed issue not empty", empty_ids(d) == [], d)

    # epic with a child only via back-ref (issue.epic==e1, not in epic.issues) -> no fire
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "epics", "e1", "doing", milestone="m1")  # no issues list
        mkitem(t, "issues", "i1", "todo", epic="e1")        # attributed via back-ref only
        _, d = run(t)
        check("empty-epic: back-ref child counts (not empty)", empty_ids(d) == [], d)

    # an epic LISTING an issue whose file is absent is NOT empty (it has listed work);
    # the missing backing is dure-doctor's concern, not empty-epic's -> disjoint
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "epics", "e1", "todo", milestone="m1", issues="[i1]")  # i1.md absent
        _, d = run(t)
        check("empty-epic: listed-but-missing issue is not empty (disjoint from doctor)",
              empty_ids(d) == [], d)

    # zero epics at all -> no empty-epic finding, no crash
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "milestones", "m1", "doing")
        ec, d = run(t)
        check("empty-epic: zero epics -> none", empty_ids(d) == [] and ec == 0, (ec, d))

    # mixed: only the childless epic fires
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        mkitem(t, "epics", "e1", "doing", milestone="m1", issues="[i1]")
        mkitem(t, "epics", "e2", "todo", milestone="m1")  # empty
        mkitem(t, "issues", "i1", "done", milestone="m1", epic="e1")
        _, d = run(t)
        check("empty-epic: only the empty epic (e2) fires", empty_ids(d) == ["e2"], d)

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
