#!/usr/bin/env python3
"""dure-status.py — progress report from per-item roadmap files (I1.5.2),
with optional local↔GitHub conflict detection (I1.5.1).

Per-milestone completion is computed from issues (the leaf work items): an issue is
attributed to its `milestone` (or its epic's milestone). Completion = done / total.

If `.dure/sync/github-status.json` exists (a cache `{<id>: "open"|"closed"}` that the
GitHub pull in E1.4 will write), conflicts are detected: local `done` vs GitHub `open`,
or local not-`done` vs GitHub `closed`.

Output: JSON {status, overall, milestones[], blockers[], conflicts[]}.
Exit: 0 normally · 2 if uninitialized / internal error.
"""
import json
import os
import re
import sys

try:
    import yaml
    HAVE_YAML = True
except Exception:  # noqa: BLE001
    HAVE_YAML = False

ROOT = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
DURE = os.path.join(ROOT, ".dure")
RD = os.path.join(DURE, "roadmap")
STATUSES = ("todo", "doing", "done", "blocked")


def read_fm(path):
    txt = open(path, encoding="utf-8").read()
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", txt, re.S)
    if not m:
        return {}
    block = m.group(1)
    if HAVE_YAML:
        try:
            return yaml.safe_load(block) or {}
        except Exception:  # noqa: BLE001
            return {}
    data = {}
    for raw in block.splitlines():
        line = re.sub(r"\s+#.*$", "", raw)
        mm = re.match(r"^([\w.-]+):\s*(.*)$", line)
        if not mm:
            continue
        k, v = mm.group(1), mm.group(2).strip()
        if v.startswith("[") and v.endswith("]"):
            inner = v[1:-1].strip()
            data[k] = [x.strip() for x in inner.split(",") if x.strip()] if inner else []
        elif v.lower() in ("null", "~", ""):
            data[k] = None
        else:
            data[k] = v.strip('"').strip("'")
    return data


def load(kind):
    out = {}
    d = os.path.join(RD, kind)
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".md"):
                fm = read_fm(os.path.join(d, fn))
                if fm.get("id"):
                    out[fm["id"]] = fm
    return out


def main():
    if not os.path.isdir(DURE):
        print(json.dumps({"status": "uninitialized"}))
        sys.exit(2)

    try:
        milestones, epics, issues = load("milestones"), load("epics"), load("issues")

        def milestone_of(iid):
            ms = issues[iid].get("milestone")
            if ms:
                return ms
            eid = issues[iid].get("epic")
            if eid in epics:
                return epics[eid].get("milestone")
            return None

        def empty_counts():
            return {s: 0 for s in STATUSES}

        buckets = {mid: {"id": mid, "title": milestones[mid].get("title", ""),
                         "counts": empty_counts(), "total": 0}
                   for mid in sorted(milestones)}
        unattached = {"id": None, "title": "(unattached)", "counts": empty_counts(), "total": 0}

        overall = empty_counts()
        for iid in sorted(issues):
            st = issues[iid].get("status")
            b = buckets.get(milestone_of(iid), unattached)
            if st in b["counts"]:
                b["counts"][st] += 1
                b["total"] += 1
                overall[st] += 1

        ms_list = []
        for b in list(buckets.values()) + ([unattached] if unattached["total"] else []):
            b["completion"] = round(b["counts"]["done"] / b["total"] * 100, 1) if b["total"] else 0.0
            ms_list.append(b)

        total = sum(overall.values())
        overall_block = {"total": total, "counts": overall,
                         "completion": round(overall["done"] / total * 100, 1) if total else 0.0}

        blockers = []
        for kind, coll in (("milestone", milestones), ("epic", epics), ("issue", issues)):
            for iid in sorted(coll):
                if coll[iid].get("status") == "blocked":
                    blockers.append({"id": iid, "type": kind, "title": coll[iid].get("title", "")})

        conflicts = []
        gh_path = os.path.join(DURE, "sync", "github-status.json")
        if os.path.isfile(gh_path):
            try:
                gh = json.load(open(gh_path, encoding="utf-8"))
            except Exception:  # noqa: BLE001
                gh = {}
            for iid, state in (gh or {}).items():
                if iid in issues:
                    local = issues[iid].get("status")
                    if state == "closed" and local != "done":
                        conflicts.append({"id": iid, "message": f"GitHub closed but local '{local}'"})
                    elif state == "open" and local == "done":
                        conflicts.append({"id": iid, "message": "local 'done' but GitHub open"})

        print(json.dumps({
            "status": "ok",
            "overall": overall_block,
            "milestones": ms_list,
            "blockers": blockers,
            "conflicts": conflicts,
        }, ensure_ascii=False, indent=2))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(2)


if __name__ == "__main__":
    main()
