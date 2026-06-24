#!/usr/bin/env python3
"""Structural tests for plugin skills.

Validates every skills/<name>/SKILL.md: front matter parses with name+description, and any
${CLAUDE_PLUGIN_ROOT}/scripts/<x> reference points to a real script. Also pins the /dure:audit
skill's contract (runs dure-audit.py; report-only). Run: python3 tests/test_plugin_skills.py
"""
import os
import re
import sys

try:
    import yaml
    HAVE_YAML = True
except Exception:  # noqa: BLE001
    HAVE_YAML = False

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SKILLS = os.path.join(REPO, "skills")
SCRIPTS = os.path.join(REPO, "scripts")
REF_RE = re.compile(r"\$\{CLAUDE_PLUGIN_ROOT\}/scripts/([\w.-]+)")

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


def front_matter(path):
    txt = open(path, encoding="utf-8").read()
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", txt, re.S)
    fm = None
    if m and HAVE_YAML:
        try:
            fm = yaml.safe_load(m.group(1))  # strict parse: catches unquoted ": " in values
        except Exception:  # noqa: BLE001
            fm = None  # invalid YAML -> the name/description check fails cleanly (no crash)
    return fm, txt


def main():
    skill_dirs = sorted(d for d in os.listdir(SKILLS) if os.path.isdir(os.path.join(SKILLS, d)))
    check("at least one skill present", len(skill_dirs) >= 1, skill_dirs)

    for d in skill_dirs:
        p = os.path.join(SKILLS, d, "SKILL.md")
        check(f"{d}: SKILL.md exists", os.path.isfile(p))
        if not os.path.isfile(p):
            continue
        fm, txt = front_matter(p)
        check(f"{d}: frontmatter has name + description",
              bool(fm) and bool(fm.get("name")) and bool(fm.get("description")), fm)
        for script in sorted(set(REF_RE.findall(txt))):
            check(f"{d}: references existing scripts/{script}",
                  os.path.isfile(os.path.join(SCRIPTS, script)), script)

    # /dure:audit skill contract
    audit_md = os.path.join(SKILLS, "audit", "SKILL.md")
    check("audit skill exists", os.path.isfile(audit_md))
    if os.path.isfile(audit_md):
        _, txt = front_matter(audit_md)
        check("audit skill runs dure-audit.py", "scripts/dure-audit.py" in txt, "")
        # tolerant of rewording: requires a 'report-only' signal AND a negation near 'roadmap'
        report_only = bool(re.search(r"(?i)report-only", txt))
        guards_roadmap = bool(re.search(r"(?is)must not\b.{0,60}roadmap", txt))
        check("audit skill declares report-only boundary (no roadmap writes)",
              report_only and guards_roadmap, (report_only, guards_roadmap))

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
