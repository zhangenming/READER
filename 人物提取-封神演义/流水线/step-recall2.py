#!/usr/bin/env python3
"""补漏 v2：用「身份标记 + 紧跟的 2-3 字」直接从原文抽人名，与名单对账（不看候选池）。"""
import json, os, re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = re.sub(r"\s+", "", open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"),
                              encoding="utf-8-sig").read())
D = json.load(open(os.path.join(ROOT, "merged-draft.json"), encoding="utf-8"))
FORMS = set()
for c in D["characters"]:
    FORMS.add(c["canonical"])
    FORMS.update(c["aliases"])
for col in D["collectives"]:
    FORMS.add(col["name"])
    FORMS.update(col["refers_to"])
FLAT = sorted(FORMS, key=len, reverse=True)


def in_list(s):
    return s in FORMS or any(s in f for f in FLAT if len(f) >= 2)


MARKS = ["总兵官","守将","先行官","上将军","大将军","中大夫","上大夫","谏议大夫","太守","知县","提辖",
         "都统","讳","名曰","名唤","本名","又名","一名","道号","法名","别号","封为","斩将封","表字","叫作","唤做"]
found = Counter()
for mk in MARKS:
    for m in re.finditer(re.escape(mk) + r"([\u4e00-\u9fa5]{2,3})", BOOK):
        found[m.group(1)] += 1
for m in re.finditer(r"姓([\u4e00-\u9fa5])名([\u4e00-\u9fa5]{1,2})", BOOK):
    found[m.group(1) + m.group(2)] += 1
cand = {}
for s, n in found.items():
    if in_list(s) or len(s) < 2:
        continue
    i = BOOK.find(s)
    cand[s] = (n, BOOK[max(0, i - 20):i + 16])
print("身份标记抽到:", len(found), " 名单外:", len(cand))
for s, (n, ctx) in sorted(cand.items(), key=lambda x: -x[1][0])[:70]:
    print(f"  {s} ×{n} :: {ctx}")
json.dump({s: v for s, v in cand.items()}, open(os.path.join(ROOT, "recall-probe2.json"), "w",
                                                 encoding="utf-8"), ensure_ascii=False, indent=1)
