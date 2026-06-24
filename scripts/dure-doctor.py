#!/usr/bin/env python3
"""dure-doctor.py — .dure/ integrity validator.

Spec: .dure/specs/dure-doctor.md. Reads a target repo's .dure/ and reports structural,
schema, and hierarchy problems. Report-only by default; `--fix` recreates only missing
dirs + an empty .dure/active (never touches config.yml, specs, or per-item files).

Output: JSON {status, checks_passed, checks_failed, violations[{check,severity,message}], warnings[]}
Exit:   0 = pass (clean or warnings only) · 1 = error-severity violations · 2 = uninitialized/internal error

Parsing: PyYAML when available; a documented regex fallback for flat front matter otherwise
(committed data is exercised via the PyYAML path; see spec OQ1).
"""
import argparse
import json
import os
import re
import sys

try:
    import yaml
    HAVE_YAML = True
except Exception:  # noqa: BLE001
    HAVE_YAML = False

REQUIRED_SUBDIRS = ["specs", "interview-logs",
                    "roadmap/milestones", "roadmap/epics", "roadmap/issues", "sync"]
STATUS_VALUES = {"todo", "doing", "done", "blocked"}
SYNC_VALUES = {"gh", "mcp", "off"}
EPIC_AS_VALUES = {"tracking-issue", "sub-issues"}
DIMS = ["problem", "scope", "acceptance", "constraints", "edge", "stakeholders"]
TYPE_BY_DIR = {"milestones": "milestone", "epics": "epic", "issues": "issue"}
REQUIRED_FIELDS = ("id", "slug", "type", "title", "status")
ID_TOKEN = re.compile(r"\b([MEImei]\d[\w.]*)")


class Report:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.violations = []
        self.warnings = []

    def ok(self):
        self.passed += 1

    def err(self, check, msg):
        self.failed += 1
        self.violations.append({"check": check, "severity": "error", "message": msg})

    def warn(self, check, msg):
        self.warnings.append({"check": check, "severity": "warning", "message": msg})


def _strip_comment(s):
    return re.sub(r"\s+#.*$", "", s)


def _is_num(v):
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def _is_int(v):
    try:
        int(str(v).strip())
        return True
    except (TypeError, ValueError):
        return False


def parse_flat(block):
    """Fallback parser for FLAT front matter: scalars, null, inline + block lists."""
    data, lines, i = {}, block.splitlines(), 0
    while i < len(lines):
        line = _strip_comment(lines[i]).rstrip()
        i += 1
        if not line.strip():
            continue
        m = re.match(r"^([\w.-]+):\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val == "":
            items = []
            while i < len(lines):
                nxt = _strip_comment(lines[i]).rstrip()
                lm = re.match(r"^\s+-\s+(.*)$", nxt)
                if lm:
                    items.append(lm.group(1).strip().strip('"').strip("'"))
                    i += 1
                elif nxt.strip() == "":
                    i += 1
                else:
                    break
            data[key] = items
        elif val.lower() in ("null", "~"):
            data[key] = None
        elif val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            data[key] = [x.strip() for x in inner.split(",") if x.strip()] if inner else []
        else:
            data[key] = val.strip('"').strip("'")
    return data


def read_front_matter(path):
    txt = open(path, encoding="utf-8").read()
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", txt, re.S)
    if not m:
        return None, "no front matter"
    block = m.group(1)
    if HAVE_YAML:
        try:
            return (yaml.safe_load(block) or {}), None
        except Exception as e:  # noqa: BLE001
            return None, f"yaml error: {e}"
    return parse_flat(block), None


def load_config(path):
    txt = open(path, encoding="utf-8").read()
    if HAVE_YAML:
        try:
            return (yaml.safe_load(txt) or {}), None
        except Exception as e:  # noqa: BLE001
            return None, f"yaml error: {e}"
    return _config_fallback(txt), None


def _config_fallback(txt):
    """Best-effort nested parse of the known config.yml shape without PyYAML."""
    cfg = {"interview": {"dimension_weights": {}}, "github": {}, "roadmap": {}}
    section = subsection = None
    for raw in txt.splitlines():
        line = _strip_comment(raw).rstrip()
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        m = re.match(r"^\s*([\w.-]+):\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if indent == 0:
            section, subsection = key, None
        elif indent == 2:
            subsection = key
            if val != "" and section in cfg:
                cfg[section][key] = None if val.lower() == "null" else val
        elif indent >= 4 and section == "interview" and subsection == "dimension_weights":
            cfg["interview"]["dimension_weights"][key] = val
    return cfg


def _check_config(dure, report):
    path = os.path.join(dure, "config.yml")
    if not os.path.isfile(path):
        report.err("config:missing", "missing .dure/config.yml")
        return
    cfg, err = load_config(path)
    if err:
        report.err("config:parse", f"config.yml parse error: {err}")
        return
    if not HAVE_YAML:
        report.warn("config:fallback", "PyYAML unavailable; config validation is limited")
    iv = (cfg or {}).get("interview") or {}
    gh = (cfg or {}).get("github") or {}

    if _is_num(iv.get("ambiguity_threshold")) and float(iv["ambiguity_threshold"]) >= 0:
        report.ok()
    else:
        report.err("config:ambiguity_threshold",
                   "interview.ambiguity_threshold must be a non-negative number")
    if _is_int(iv.get("min_rounds")):
        report.ok()
    else:
        report.err("config:min_rounds", "interview.min_rounds must be an integer")

    dw = iv.get("dimension_weights") or {}
    missing = [d for d in DIMS if d not in dw]
    if missing:
        report.err("config:dimension_weights", f"dimension_weights missing keys: {missing}")
    elif all(_is_num(dw[d]) and float(dw[d]) >= 0 for d in DIMS):
        report.ok()
    else:
        report.err("config:weights", "dimension_weights must be non-negative numbers")

    if gh.get("sync") in SYNC_VALUES:
        report.ok()
    else:
        report.err("config:github.sync",
                   f"github.sync must be one of {sorted(SYNC_VALUES)} (got {gh.get('sync')!r})")
    if gh.get("epic_as") in EPIC_AS_VALUES:
        report.ok()
    else:
        report.err("config:github.epic_as",
                   f"github.epic_as must be one of {sorted(EPIC_AS_VALUES)} (got {gh.get('epic_as')!r})")


def _check_active(dure, report):
    path = os.path.join(dure, "active")
    if not os.path.isfile(path):
        report.err("active:missing", "missing .dure/active")
        return
    slug = open(path, encoding="utf-8").read().strip()
    if slug == "" or os.path.isfile(os.path.join(dure, "specs", slug + ".md")):
        report.ok()
    else:
        report.err("active:dangling", f"active points to '{slug}' but specs/{slug}.md is missing")


def _scan_items(dure, report):
    items, existing = {}, set()
    for sub, typ in TYPE_BY_DIR.items():
        d = os.path.join(dure, "roadmap", sub)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".md"):
                continue
            rel = f"roadmap/{sub}/{fn}"
            data, err = read_front_matter(os.path.join(d, fn))
            if err:
                report.err(f"item:frontmatter:{rel}", f"{rel}: {err}")
                continue
            for f in REQUIRED_FIELDS:
                if not data.get(f):
                    report.err(f"item:field:{rel}", f"{rel}: missing front-matter field '{f}'")
            iid = data.get("id")
            if iid:
                existing.add(iid)
                items.setdefault(typ, {})[iid] = data
            if data.get("type") == typ:
                report.ok()
            else:
                report.err(f"item:type:{rel}", f"{rel}: type {data.get('type')!r} != {typ!r}")
            if data.get("status") in STATUS_VALUES:
                report.ok()
            else:
                report.err(f"item:status:{rel}", f"{rel}: invalid status {data.get('status')!r}")
            if typ == "issue":
                acc = data.get("acceptance")
                if isinstance(acc, list) and len(acc) > 0:
                    report.ok()
                else:
                    report.err(f"item:acceptance:{rel}", f"{rel}: issue must have a non-empty acceptance[]")
    return items, existing


def _check_hierarchy(dure, items, existing, report):
    # child -> parent: a reference to a nonexistent parent file is an ERROR
    for by_id in items.values():
        for iid, data in by_id.items():
            for field in ("milestone", "epic"):
                ref = data.get(field)
                if ref is None:
                    continue
                if ref in existing:
                    report.ok()
                else:
                    report.err(f"hier:{iid}:{field}", f"{iid}: {field} '{ref}' has no backing file")
    # parent -> child arrays + index references: missing backing file is a WARNING (#18')
    referenced = set()
    for by_id in items.values():
        for data in by_id.values():
            for field in ("epics", "issues"):
                for ref in (data.get(field) or []):
                    referenced.add(ref)
    idx = os.path.join(dure, "roadmap", "index.md")
    if os.path.isfile(idx):
        for tok in ID_TOKEN.findall(open(idx, encoding="utf-8").read()):
            referenced.add(tok.lower().rstrip("."))
    for ref in sorted(referenced):
        if ref not in existing:
            report.warn("ref:missing-backing",
                        f"referenced id '{ref}' has no backing per-item file (#18')")


def _check_github_map(dure, existing, report):
    path = os.path.join(dure, "sync", "github-map.json")
    if not os.path.isfile(path):
        report.warn("github-map:absent", "sync/github-map.json absent (local-only); skipped")
        return
    try:
        gm = json.load(open(path, encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        report.err("github-map:json", f"github-map.json invalid JSON: {e}")
        return
    if not isinstance(gm, dict) or any(not isinstance(gm.get(k, {}), dict)
                                       for k in ("milestones", "epics", "issues")):
        report.err("github-map:shape",
                   "github-map.json must be an object with milestones/epics/issues objects")
        return
    report.ok()
    for k in ("milestones", "epics", "issues"):
        for lid in gm.get(k, {}):
            if lid not in existing:
                report.warn("github-map:stale", f"github-map references unknown id '{lid}'")


def validate(root, report):
    dure = os.path.join(root, ".dure")
    if not os.path.isdir(dure):
        return "uninitialized"
    report.ok()  # check 1: .dure/ exists
    for sd in REQUIRED_SUBDIRS:  # check 2
        if os.path.isdir(os.path.join(dure, sd)):
            report.ok()
        else:
            report.err(f"struct:{sd}", f"missing required subdir .dure/{sd}")
    _check_config(dure, report)
    _check_active(dure, report)
    items, existing = _scan_items(dure, report)
    _check_hierarchy(dure, items, existing, report)
    _check_github_map(dure, existing, report)
    return "fail" if report.failed > 0 else "pass"


def apply_fix(root):
    """SAFE repairs only: recreate missing dirs + an empty .dure/active. Touches nothing else."""
    dure = os.path.join(root, ".dure")
    changes = []
    for sd in [""] + REQUIRED_SUBDIRS:
        p = os.path.join(dure, sd) if sd else dure
        if not os.path.isdir(p):
            os.makedirs(p, exist_ok=True)
            changes.append(f"created dir {os.path.relpath(p, root)}")
    active = os.path.join(dure, "active")
    if not os.path.exists(active):
        open(active, "w").close()
        changes.append("created empty .dure/active")
    return changes


def main():
    ap = argparse.ArgumentParser(description="Validate a .dure/ directory's integrity.")
    ap.add_argument("--fix", action="store_true",
                    help="apply SAFE repairs (missing dirs + empty .dure/active) before reporting")
    args = ap.parse_args()
    root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    report = Report()
    fixed = None
    try:
        if args.fix:
            fixed = apply_fix(root)
        status = validate(root, report)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"status": "error", "checks_passed": report.passed,
                          "checks_failed": report.failed + 1,
                          "violations": [{"check": "internal", "severity": "error", "message": str(e)}],
                          "warnings": report.warnings}, ensure_ascii=False, indent=2))
        sys.exit(2)

    out = {"status": status, "checks_passed": report.passed, "checks_failed": report.failed,
           "violations": report.violations, "warnings": report.warnings}
    if fixed is not None:
        out["fixed"] = fixed
    print(json.dumps(out, ensure_ascii=False, indent=2))
    if status == "uninitialized":
        sys.exit(2)
    sys.exit(1 if report.failed > 0 else 0)


if __name__ == "__main__":
    main()
