#!/usr/bin/env python3
"""对 per-chunk 的问题条目做全书级复核：名字在不在全书、evidence 是不是原文。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PC = os.path.join(ROOT, "per-chunk")
BOOK = norm = None
with open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"), encoding="utf-8-sig") as f:
    BOOK = re.sub(r"\s+", "", f.read())


def N(s):
    return re.sub(r"\s+", "", s or "")


name_missing = []
ev_missing = []
alias_missing = []
for fn in sorted(os.listdir(PC)):
    for c in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("characters", []):
        nm, ev = c.get("name", ""), c.get("evidence", "")
        if "讳" in ev:  # chunk-0065 点名册：姓+讳X 重构
            continue
        if N(nm) not in BOOK:
            name_missing.append((fn, nm, ev[:40]))
        if N(ev) and N(ev) not in BOOK:
            ev_missing.append((fn, nm, ev[:60]))
        for a in c.get("aliases") or []:
            if N(a) not in BOOK:
                alias_missing.append((fn, nm, a))

print("=== 全书都找不到该写法 (name) ===", len(name_missing))
for r in name_missing:
    print("  ", r)
print("=== evidence 非原文（全书都对不上）===", len(ev_missing))
for r in ev_missing:
    print("  ", r)
print("=== alias 全书都对不上 ===", len(alias_missing))
for r in alias_missing:
    print("  ", r)
json.dump({"name_missing": name_missing, "evidence_missing": ev_missing,
           "alias_missing": alias_missing},
          open(os.path.join(ROOT, "问题条目复核.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
