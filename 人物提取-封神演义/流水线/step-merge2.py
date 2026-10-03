#!/usr/bin/env python3
"""归并 v2：只允许「无歧义」的别名边参与并条，泛称自动识别并剔除。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PC = os.path.join(ROOT, "per-chunk")
BOOK = re.sub(r"\s+", "", open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"),
                              encoding="utf-8-sig").read())
CACHE = {}


def count(s):
    if s in CACHE:
        return CACHE[s]
    c, i = 0, BOOK.find(s)
    while i >= 0:
        c += 1
        i = BOOK.find(s, i + 1)
    CACHE[s] = c
    return c


def N(s):
    return re.sub(r"\s+", "", s or "")


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

    def groups(self, nodes):
        g = defaultdict(set)
        for n in nodes:
            g[self.find(n)].add(n)
        return g


entries = []      # (chunk, entry)
edges = []        # (name, alias)
for fn in sorted(os.listdir(PC)):
    n = int(re.search(r"(\d+)", fn).group(1))
    for c in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("characters", []):
        c["_chunk"] = n
        c["_note"] = c.pop("note", "") or ""
        entries.append(c)
        nm = N(c.get("name"))
        for a in c.get("aliases") or []:
            a = N(a)
            if a and a != nm and len(a) >= 2:
                edges.append((nm, a))

nodes = {c["_chunk"] and N(c.get("name")) for c in entries} | {b for _, b in edges}
allowed = set()
for a, b in edges:
    if a in b or b in a:
        allowed.add((a, b))

# 迭代剔除歧义别名：某别名若桥接到 ≥2 个「当前簇」，判为泛称
for _ in range(6):
    ds = DS()
    for a, b in allowed:
        ds.union(a, b)
    g = ds.groups(nodes)
    cid = {v: ds.find(v) for v in nodes}
    owners = defaultdict(set)
    for a, b in edges:
        if len(a) < 2:
            continue
        owners[b].add(cid[a])
    generic = {b for b, s in owners.items() if len(s) >= 2}
    new_allowed = {(a, b) for a, b in edges if b not in generic and len(a) >= 2}
    if new_allowed == allowed:
        break
    allowed = new_allowed
print("歧义泛称（已剔除，不并入任何人）:", len(generic))
print("  ", "、".join(sorted(generic)))

ds = DS()
for a, b in allowed:
    ds.union(a, b)
comps = ds.groups(nodes)
print("组件数:", len(comps), " 参与并条的边:", len(allowed))

# 可疑组件：含 2 个以上「高频且互不包含」的正式姓名
susp = []
for root, s in comps.items():
    tops = [v for v in s if count(v) >= 40]
    keep = []
    for v in sorted(tops, key=lambda x: -len(x)):
        if not any(v in k for k in keep):
            keep.append(v)
    if len(keep) >= 2:
        susp.append((sorted(s, key=lambda x: -count(x)), keep))
print("--- 可疑并条组件", len(susp), "---")
for s, keep in susp[:20]:
    print("  ", " | ".join(f"{v}{count(v)}" for v in s[:12]))
json.dump({"allowed_edges": sorted(allowed), "generic": sorted(generic),
           "components": [sorted(s, key=lambda x: -count(x)) for s in comps.values()]},
          open(os.path.join(ROOT, "merge-graph.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
