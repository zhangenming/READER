#!/usr/bin/env python3
"""per-chunk 产物体检：schema / 逐字回查 / 重复 / nonhuman 口径统计。"""
import json, os, re, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PC = os.path.join(ROOT, "per-chunk")
CH = os.path.join(ROOT, "chunks")
KEYS = {"name", "aliases", "identity", "nonhuman", "mentioned_only", "evidence"}


def norm(s):
    return re.sub(r"\s+", "", s or "")


def text_of(n):
    with open(os.path.join(CH, f"chunk-{n:04d}.txt"), encoding="utf-8-sig") as f:
        return norm(f.read())


report = []
rows = []
for fn in sorted(os.listdir(PC)):
    n = int(re.search(r"(\d+)", fn).group(1))
    path = os.path.join(PC, fn)
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        report.append(f"{fn} JSON 解析失败: {e}")
        continue
    extra = set(d) - {"chunk", "characters", "collectives"}
    if extra:
        report.append(f"{fn} 顶层多余字段 {sorted(extra)}")
    if d.get("chunk") != n:
        report.append(f"{fn} chunk 号 {d.get('chunk')} != 文件名 {n}")
    txt = text_of(n)
    seen = {}
    for i, c in enumerate(d.get("characters", [])):
        miss = KEYS - set(c)
        ext = set(c) - KEYS
        if miss or ext:
            report.append(f"{fn} #{i} 字段 缺{sorted(miss)} 多{sorted(ext)}")
        name = c.get("name", "")
        if name in seen:
            report.append(f"{fn} 重名条目 {name}")
        seen[name] = 1
        # chunk-0065 点名册是「姓+讳X」重构，原文不含连写全名
        exempt = "讳" in (c.get("evidence") or "")
        if not exempt and norm(name) not in txt:
            report.append(f"{fn} name 不在原文: {name}")
        for a in c.get("aliases") or []:
            if norm(a) not in txt:
                report.append(f"{fn} alias 不在原文: {name} ← {a}")
        ev = c.get("evidence") or ""
        if norm(ev) not in txt:
            report.append(f"{fn} evidence 不在原文: {name}")
        rows.append((name, bool(c.get("nonhuman")), bool(c.get("mentioned_only")), n))
    for col in d.get("collectives") or []:
        if norm(col.get("name", "")) not in txt:
            report.append(f"{fn} 合称不在原文: {col.get('name')}")

by_name = defaultdict(lambda: {"nonhuman": 0, "human": 0, "chunks": []})
for name, nh, mo, n in rows:
    by_name[name]["nonhuman" if nh else "human"] += 1
    by_name[name]["chunks"].append(n)

conflict = {k: v for k, v in by_name.items() if v["nonhuman"] and v["human"]}
print(f"条目 {len(rows)} / 去重后 {len(by_name)} / 报告问题 {len(report)}")
print("nonhuman 口径冲突（同名既标人又标非人）:", len(conflict))
for k, v in sorted(conflict.items(), key=lambda x: -(x[1]["human"] + x[1]["nonhuman"]))[:25]:
    print("  ", k, "human", v["human"], "nonhuman", v["nonhuman"])
print("---- 问题清单 ----")
for r in report:
    print(r)
json.dump(
    {"entries": len(rows), "distinct": len(by_name), "issues": report,
     "nonhuman_conflicts": {k: v for k, v in conflict.items()}},
    open(os.path.join(ROOT, "per-chunk-体检.json"), "w", encoding="utf-8"),
    ensure_ascii=False, indent=1)
