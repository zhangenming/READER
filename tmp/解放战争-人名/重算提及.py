# -*- coding: utf-8 -*-
"""用最终人名表重算全书与分册提及次数（一次性、口径唯一），并写回 人名-终校.json。

之前的 mentions 是在 2.7 万个候选（含“胡宗南的”“毛泽东又”这类待剔串）的trie里算的，
长串会截走真名的匹配；这里只用定稿人名建 trie，计数更准。
"""
import io
import json
import os
import re

BASE = "/Users/zem/AI/READER"
D = os.path.join(BASE, "tmp", "解放战争-人名")
BOOK = os.path.join(BASE, "txt", "解放战争（套装共6册）.txt")

path = os.path.join(D, "人名-终校.json")
data = json.load(io.open(path, encoding="utf-8"))
N = data["names"]
names = sorted(N, key=len, reverse=True)

lines = io.open(BOOK, encoding="utf-8").read().split("\n")
VOL_RE = re.compile(r"^第([一二三四五六])部")
CHAP_RE = re.compile(r"^第(\d+)章[  \u3000]*(.*)$")
vol_of, chap_of = [], []
vol, chapno, chap = "序", "0", ""
for ln in lines:
    m = VOL_RE.match(ln)
    if m:
        vol, chapno, chap = m.group(1), "0", ""
    else:
        m = CHAP_RE.match(ln)
        if m:
            chapno, chap = m.group(1), m.group(2).strip()
    vol_of.append(vol)
    chap_of.append(("第%s章 %s" % (chapno, chap)) if chapno != "0" else "")

trie = {}
for w in names:
    node = trie.setdefault(w[0], {})
    for ch in w[1:]:
        node = node.setdefault(ch, {})
    node["$"] = w
MAXLEN = max(len(w) for w in names)
RUN = re.compile(r"[一-鿿·]+")

tot, firstv, lastv, volset = {}, {}, {}, {}
per = {}
for li, ln in enumerate(lines):
    v = vol_of[li]
    for run in RUN.finditer(ln):
        s = run.group(0)
        i = 0
        while i < len(s):
            node = trie.get(s[i])
            if node is None:
                i += 1
                continue
            best, j = node.get("$"), i + 1
            while j < len(s) and j - i < MAXLEN:
                node = node.get(s[j])
                if node is None:
                    break
                if "$" in node:
                    best = node["$"]
                j += 1
            if not best:
                i += 1
                continue
            tot[best] = tot.get(best, 0) + 1
            if best not in firstv:
                firstv[best] = (vol_of[li], chap_of[li])
            lastv[best] = (vol_of[li], chap_of[li])
            volset.setdefault(best, set()).add(vol_of[li])
            per.setdefault(v, {}).setdefault(best, [0, ""])
            per[v][best][0] += 1
            if not per[v][best][1]:
                per[v][best][1] = chap_of[li]
            i += len(best)

VOLNAME = {"一": "一部 中原西南", "二": "二部 中南", "三": "三部 东北", "四": "四部 华北",
           "五": "五部 西北", "六": "六部 华东", "序": "书前"}
for w, e in N.items():
    e["mentions_old"] = e.get("mentions", 0)
    e["mentions"] = tot.get(w, 0)
    fv, fc = firstv.get(w, ("", ""))
    lv, lc = lastv.get(w, ("", ""))
    e["first"] = (VOLNAME.get(fv, fv) + " " + fc).strip()
    e["last"] = (VOLNAME.get(lv, lv) + " " + lc).strip()
    e["vols"] = sorted(volset.get(w, set()), key=lambda v: "一二三四五六序".index(v) if v in "一二三四五六序" else 9)
data["per_volume"] = {v: {w: {"n": x[0], "first": x[1]} for w, x in per[v].items()} for v in per}
io.open(path, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False))
io.open(os.path.join(D, "分册计数.json"), "w", encoding="utf-8").write(
    json.dumps(data["per_volume"], ensure_ascii=False))
print("重算完成：主表 %d 人，提及合计 %d 次（原 %d 次）"
      % (len(N), sum(tot.values()), sum(v["mentions_old"] for v in N.values())))
print("变化最大：", "  ".join("%s %d→%d" % (w, N[w]["mentions_old"], N[w]["mentions"])
                        for w in sorted(N, key=lambda k: -(tot.get(k, 0) - N[k]["mentions_old"]))[:8]))
