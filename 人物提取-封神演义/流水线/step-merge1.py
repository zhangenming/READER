#!/usr/bin/env python3
"""第3步 全局归并：别名并条 + canonical 选取 + 组件体检。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PC = os.path.join(ROOT, "per-chunk")
with open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"), encoding="utf-8-sig") as f:
    BOOK = re.sub(r"\s+", "", f.read())


def N(s):
    return re.sub(r"\s+", "", s or "")


def count(s):
    c, i = 0, BOOK.find(s)
    while i >= 0:
        c += 1
        i = BOOK.find(s, i + 1)
    return c


class DS:
    def __init__(self):
        self.p = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


ds = DS()
recs = defaultdict(list)  # variant -> [(chunk, entry)]
notes = defaultdict(list)
collectives = defaultdict(lambda: {"refers_to": set(), "chunks": set()})
for fn in sorted(os.listdir(PC)):
    n = int(re.search(r"(\d+)", fn).group(1))
    d = json.load(open(os.path.join(PC, fn), encoding="utf-8"))
    for c in d.get("characters", []):
        nm = N(c.get("name"))
        if not nm:
            continue
        c["_chunk"] = n
        c["_note"] = c.pop("note", "")
        recs[nm].append(c)
        for a in c.get("aliases") or []:
            a = N(a)
            if a:
                ds.union(nm, a)
                recs.setdefault(a, []).append({"_alias_only": True, "_chunk": n})
    for col in d.get("collectives") or []:
        e = collectives[N(col.get("name"))]
        e["refers_to"].update(N(x) for x in (col.get("refers_to") or []) if N(x))
        e["chunks"].add(n)

comps = defaultdict(set)
for v in list(recs):
    comps[ds.find(v)].add(v)

# 组件体检：变体多、或把「非子串关系的高频称号」桥接起来的，人工过一眼
big = sorted(comps.values(), key=lambda s: -len(s))
print("并条后组件数:", len(comps), " 变体总数:", len(recs))
print("--- 变体最多的 25 组 ---")
for s in big[:25]:
    print("  ", sorted(s, key=lambda x: -count(x))[:14])
print("--- 单条但 name 在全书 0 次（需修正写法）---")
for s in big:
    for v in s:
        if count(v) == 0 and v != "李吉":
            print("  ", v, "| 组件:", sorted(s)[:6])
json.dump({"components": [sorted(s) for s in comps.values()],
           "collectives": {k: {"refers_to": sorted(v["refers_to"]), "chunks": sorted(v["chunks"])}
                           for k, v in collectives.items()}},
          open(os.path.join(ROOT, "merge-raw.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
