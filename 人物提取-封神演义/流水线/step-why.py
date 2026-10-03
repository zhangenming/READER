#!/usr/bin/env python3
"""打印 21 个冲突组件里「非子串关系的并条边」出自哪些条目，供定向拆条。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PC = os.path.join(ROOT, "per-chunk")
G = json.load(open(os.path.join(ROOT, "merge-graph.json"), encoding="utf-8"))
comps = G["components"]

owner = {}
for ci, s in enumerate(comps):
    for v in s:
        owner[v] = ci

subs = defaultdict(list)
for fn in sorted(os.listdir(PC)):
    n = int(re.search(r"(\d+)", fn).group(1))
    for c in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("characters", []):
        nm = re.sub(r"\s+", "", c.get("name") or "")
        al = [re.sub(r"\s+", "", a) for a in (c.get("aliases") or [])]
        subs[nm].append((n, al, (c.get("identity") or "")[:26]))

want = set()
for s in comps:
    hi = [v for v in s if v in owner]
    big = [v for v in s]
    distinct = []
    for v in sorted(s, key=lambda x: -len(x)):
        if not any(v in k or k in v for k in distinct) and len(v) >= 2:
            distinct.append(v)
    strong = [v for v in s if re.match(r"^(姜|黄|姬|殷|苏|邓|崇|韩|方|陈|郑|周|胡|窦|袁|比|微|箕|赵|雷|鲁|晁|柏|哪吒|金吒|木吒)", v)]
    if len(set(s) - {x for v in s for x in s if x != v and x in v}) >= 2 and len(strong) >= 2:
        want.add(s[0] if s else "")
        for v in strong[:6]:
            pass

# 直接：对每个组件，列出所有条目里 name 与 alias 分属两个「互不为子串」的正式姓名
print("=== 可疑并条来源条目 ===")
seen = set()
for s in comps:
    names = [v for v in s if len(v) >= 2]
    indep = []
    for v in sorted(names, key=lambda x: -len(x)):
        if not any(v != k and v in k for k in indep):
            indep.append(v)
    strong = [v for v in indep if any(re.search(p, v) for p in
              ["太岁", "郊", "洪", "奇", "伦", "弼", "相", "吒", "化", "忠", "雷", "田", "比干", "微子",
               "箕子", "滚", "发", "昌", "考", "虎", "猿", "焕", "楚", "禄", "环", "羽", "鹏", "纪",
               "宝", "成", "贵", "荣", "升", "变", "鹍", "武", "汤", "乙", "牙", "尚", "戬"])]
    if len(strong) < 2:
        continue
    key = tuple(sorted(strong))
    if key in seen:
        continue
    seen.add(key)
    print("\n组件包含:", "、".join(sorted(s, key=lambda x: -len(x))[:14]))
    for nm in strong:
        for (n, al, ident) in subs.get(nm, [])[:3]:
            other = [a for a in al if a in s and a != nm and not (a in nm or nm in a)]
            if other:
                print(f"   chunk{n} name={nm} 身份={ident} → 非子串别名 {other}")
