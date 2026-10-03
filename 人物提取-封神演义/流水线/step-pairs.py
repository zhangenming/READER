#!/usr/bin/env python3
"""列出所有「非子串关系」的被断言别名对，供逐对裁决。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PC = os.path.join(ROOT, "per-chunk")
BOOK = re.sub(r"\s+", "", open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"),
                              encoding="utf-8-sig").read())
C = {}


def count(s):
    if s not in C:
        C[s] = BOOK.count(s)
    return C[s]


def N(s):
    return re.sub(r"\s+", "", s or "")


pairs = defaultdict(lambda: {"chunks": set(), "ids": []})
for fn in sorted(os.listdir(PC)):
    n = int(re.search(r"(\d+)", fn).group(1))
    for c in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("characters", []):
        nm = N(c.get("name"))
        for a in {N(x) for x in (c.get("aliases") or [])}:
            if not a or a == nm or len(a) < 2 or len(nm) < 2:
                continue
            if a in nm or nm in a:
                continue
            k = tuple(sorted((nm, a)))
            p = pairs[k]
            p["chunks"].add(n)
            p["ids"].append((n, c.get("identity") or ""))

print("非子串断言对:", len(pairs))
rows = sorted(pairs.items(), key=lambda x: (-len(x[1]["chunks"]), -min(count(x[0][0]), count(x[0][1]))))
out = []
for (a, b), v in rows:
    out.append(f"{a}({count(a)}) ↔ {b}({count(b)})  块{len(v['chunks'])}  例:{v['ids'][0][1][:22]}")
print("\n".join(out[:200]))
json.dump([[list(k), len(v["chunks"]), sorted(v["chunks"])] for k, v in rows],
          open(os.path.join(ROOT, "pairs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
