#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第5步 交付：按「最大跨度不重复」计次 → 人物名单.md / characters.json / 人名导入.txt。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = re.sub(r"\s+", "", open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"),
                              encoding="utf-8-sig").read())
META = json.load(open(os.path.join(ROOT, "meta.json"), encoding="utf-8"))
PCT = {i: c["pct"] for i, c in enumerate(META["chunks"], 1)}
V = json.load(open(os.path.join(ROOT, "verification.json"), encoding="utf-8"))
D = json.load(open(os.path.join(ROOT, "merged-draft.json"), encoding="utf-8"))
MV = json.load(open(os.path.join(ROOT, "merge-v6.json"), encoding="utf-8"))
AUD = json.load(open(os.path.join(ROOT, "audit-v3.json"), encoding="utf-8"))
CANDS = {c["name"]: c for c in json.load(open(os.path.join(ROOT, "candidates.json"), encoding="utf-8"))}
VER = {r["canonical"]: r for r in V["characters"]}

persons = D["characters"]
# ---------- 0) 剔除错误挂靠的写法（这些是叙述人称/泛称，不是该人的专称） ----------
JUNK_STRIP = {"公子", "二公子", "列国诸侯", "掌教师尊", "西方圣人", "老大王", "掌教", "老师父",
              "西方教主?"  , "童子", "道人", "仙长", "吾师", "贫道", "末将", "为将"}
JUNK_STRIP = {x for x in JUNK_STRIP if "?" not in x}
strip_log, ledger_note = [], []
for p_ in persons:
    bad = [f for f in [p_["canonical"]] + list(p_["aliases"]) if f in JUNK_STRIP]
    if bad and len(p_["forms"]) > len(bad):
        keep = [f for f in [p_["canonical"]] + list(p_["aliases"]) if f not in JUNK_STRIP]
        if p_["canonical"] in JUNK_STRIP:
            p_["canonical"] = max(keep, key=lambda v: BOOK.count(v))
        p_["aliases"] = [f for f in keep if f != p_["canonical"]]
        p_["forms"] = [f for f in p_["forms"] if f not in JUNK_STRIP]
        for b in bad:
            strip_log.append({"candidate": b, "count": BOOK.count(b),
                              "class": "从别名下线（叙述人称/泛称）",
                              "reason": "曾挂在「%s」名下，但全书该写法不专指此人" % p_["canonical"]})

# ---------- 1) 最大跨度计次：一个位置只归给最长的那个写法，且只归一次 ----------
form_owner, collide = {}, defaultdict(set)
for idx, p in enumerate(persons):
    for f in [p["canonical"]] + list(p["aliases"]):
        collide[f].add(idx)
        form_owner[f] = idx
clash = {f: sorted(v) for f, v in collide.items() if len(v) > 1}
print("同写法归了多个人（需裁决，计次暂给后者）:", len(clash),
      list(clash)[:12])
forms_sorted = sorted(form_owner, key=len, reverse=True)
mentions = [0] * len(persons)
per_form = defaultdict(lambda: defaultdict(int))
covered = bytearray(len(BOOK))
for f in forms_sorted:
    i = BOOK.find(f)
    while i >= 0:
        seg = slice(i, i + len(f))
        if not any(covered[seg]):
            for k in range(i, i + len(f)):
                covered[k] = 1
            idx = form_owner[f]
            mentions[idx] += 1
            per_form[idx][f] += 1
        i = BOOK.find(f, i + 1)


RAW = open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"), encoding="utf-8-sig").read()
ROSTER = {}       # 复原姓名 -> 「姓+讳+名」在正文里的出现次数
ROSTER_TITLE = {}  # 复原姓名 -> 名单上的封号/星号写法
TOK = [t for t in re.split(r"[\s\u3000\u00a0]+", RAW) if t]
for ti, t in enumerate(TOK):
    if "讳" not in t or len(t) < 2:
        continue
    if t.endswith("讳") and ti + 1 < len(TOK):
        t = t + TOK[ti + 1]
    if t.startswith("讳"):
        # 原文排成「地察星　张　讳焕」：姓单独成块
        prev = TOK[ti - 1] if ti else ""
        if not prev:
            continue
        t = prev[-1] + t
    pre, _, post = t.partition("讳")
    pre, post = re.sub(r"[^\u4e00-\u9fa5]", "", pre), re.sub(r"[^\u4e00-\u9fa5]", "", post)
    if not post:
        continue
    sur = pre[-1] if pre else ""
    if not sur:
        continue
    name = sur + post
    ROSTER[name] = max(ROSTER.get(name, 0), BOOK.count(sur + "讳" + post))
    if len(pre) >= 2:
        ROSTER_TITLE[name] = pre[:-1]
    elif ti >= 2 and len(TOK[ti - 2]) >= 2:
        ROSTER_TITLE[name] = TOK[ti - 2]
for m in re.finditer(r"姓([\u4e00-\u9fa5])[，、]?名([\u4e00-\u9fa5]{1,3})", BOOK):
    nm = m.group(1) + m.group(2)
    ROSTER[nm] = max(ROSTER.get(nm, 0),
                     BOOK.count(m.group(1) + "名" + m.group(2)),
                     BOOK.count(m.group(1) + "，名" + m.group(2)),
                     BOOK.count(m.group(0)))


def hui_count(name):
    """第99回名单「姓 讳 名」式写法的真实出现次数（姓名不连写时唯一的计次依据）。"""
    return ROSTER.get(name, 0) if len(name) >= 2 else 0


def hui_attested(name):
    return hui_count(name) > 0


# ---------- 1a) 名单截断复原：3 字截断把「姚讳公孝」读成「姚公」的，按名单原文补全 ----------
rejoined = []
for p in persons:
    if BOOK.count(p["canonical"]) == 0 and p["canonical"] in ROSTER:
        c = p["canonical"]
        longer = [k for k in ROSTER if k.startswith(c) and len(k) > len(c) and ROSTER[k]]
        if longer:
            rej = max(longer, key=len)
            p["aliases"] = sorted(set(p["aliases"] + [c]), key=lambda v: -BOOK.count(v))
            p["canonical"] = rej
            rejoined.append((c, rej))

# ---------- 1b) 名单式写法补计次：本名不连写的人，按「姓+讳+名」的原文格式计 ----------
for idx, p in enumerate(persons):
    if mentions[idx] == 0:
        for f in [p["canonical"]] + list(p["aliases"]):
            hc = hui_count(f)
            if hc:
                mentions[idx] += hc
                per_form[idx]["〔名单作「%s」〕" % (f[0] + "　讳　" + f[1:])] = hc
                p["attested_via"] = "原文作「%s」" % (f[0] + "　讳　" + f[1:])
                break

# ---------- 2) 修正 canonical：点名册「某星 姓 讳名」的人，本名优先 ----------
fixed = 0
for idx, p in enumerate(persons):
    forms = [p["canonical"]] + list(p["aliases"])
    if max((BOOK.count(f) for f in forms), default=0) >= 10:
        continue
    cands = [f for f in forms if hui_attested(f)]
    if cands:
        new = max(cands, key=len)
        if new != p["canonical"]:
            p["aliases"] = sorted(set([p["canonical"]] + [f for f in forms if f != new]),
                                  key=lambda v: -BOOK.count(v))
            p["canonical"] = new
            p["attested_via"] = "封神名单作「%s」" % (new[0] + "　讳　" + new[1:])
            fixed += 1

# ---------- 2b) 修 canonical：本名 0 次而别名有真实出现的，换成真实出现的写法 ----------
relabel = 0
for p in persons:
    forms = [p["canonical"]] + list(p["aliases"])
    if BOOK.count(p["canonical"]) > 0:
        continue
    lit = [f for f in forms if BOOK.count(f) > 0]
    if lit:
        new = max(lit, key=lambda v: (BOOK.count(v), len(v)))
        p["aliases"] = sorted(set([f for f in forms if f != new]), key=lambda v: -BOOK.count(v))
        p["canonical"] = new
        relabel += 1

# ---------- 2c) 别名下线：既无字面出现、又不合「姓 讳 名」格式的写法（精读笔误）剔除 ----------
alias_fix = 0
for p in persons:
    bad = [a for a in p["aliases"] if BOOK.count(a) == 0 and hui_count(a) == 0]
    for a in bad:
        ledger_note.append({"candidate": a, "count": 0, "class": "别名剔除（原文无此写法）",
                            "reason": "挂在「%s」名下，但该写法在正文与「讳」名单里都查不到" % p["canonical"]})
    if bad:
        p["aliases"] = [a for a in p["aliases"] if a not in bad]
        p["forms"] = [f for f in p["forms"] if f not in bad]
        alias_fix += len(bad)

# ---------- 3) 分级 ----------
for idx, p in enumerate(persons):
    tot = mentions[idx]
    p["mentions"] = tot
    p["form_counts"] = dict(per_form[idx])
    if p.get("mentioned_only") and tot <= 3:
        lv = "仅提及"
    elif tot >= 700:
        lv = "主角"
    elif tot >= 200:
        lv = "重要配角"
    elif tot >= 40:
        lv = "次要人物"
    elif tot >= 5:
        lv = "有名有姓的过场人物"
    else:
        lv = "仅提及"
    p["importance"] = lv
    pos = [BOOK.find(f) for f in [p["canonical"]] + list(p["aliases"]) if BOOK.count(f) > 0]
    pos = [x for x in pos if x >= 0]
    p["first_seen_pct"] = round(min(pos) / len(BOOK), 4) if pos else p.get("first_seen_pct", 0)

# ---------- 4) 过滤台账（候选池里没进名单的，一条不静默丢） ----------
ledger = []
for kind, items in AUD["classes"].items():
    for it in items:
        ledger.append({"candidate": it["candidate"], "count": it["count"],
                       "class": kind, "reason": it["reason"]})
for r in AUD["review"]:
    ledger.append({"candidate": r["name"], "count": r["count"], "class": "待人工·非人名",
                   "reason": "有独立出现但不具人名形态（动宾/专名/法宝/地名），经抽查非人物"})
for forms, owners in MV["orphan_titles"]:
    ledger.append({"candidate": "、".join(forms[:3]), "count": sum(BOOK.count(f) for f in forms[:3]),
                   "class": "歧义称号（多人共用，不并条）",
                   "reason": "本书被两人以上各用过：" + "；".join(f"{k}×{v}" for k, v in list(owners.items())[:4])})
for l in strip_log + ledger_note:
    ledger.append(l)
known_forms = {p["canonical"] for p in persons} | {a for p in persons for a in p["aliases"]}
for c in D["filtered"]:
    ledger.append({"candidate": c["candidate"], "count": c.get("count", 0),
                   "class": "精读存疑剔除", "reason": c.get("reason", "")})

LV_ORDER = ["主角", "重要配角", "次要人物", "有名有姓的过场人物", "仅提及"]
persons.sort(key=lambda p: -p["mentions"])
colls = [c for c in D["collectives"] if c["count"] > 0]
colls.sort(key=lambda c: -c["count"])

with open(os.path.join(ROOT, "存疑待核.txt"), "w", encoding="utf-8") as f:
    f.write("《封神演义》人名提取 · 候选裁决台账（每一笔都有结论，可翻案）\n")
    f.write("候选池共 %d 条，count>=2 的 %d 条，已逐条给出去向。\n\n"
            % (len(CANDS), sum(1 for c in CANDS.values() if c["count"] >= 2)))
    cur = None
    for it in sorted(ledger, key=lambda x: (x["class"], -x["count"])):
        if it["class"] != cur:
            cur = it["class"]
            f.write("\n## %s\n" % cur)
        f.write("%s\t%d\t%s\n" % (it["candidate"], it["count"], it["reason"]))

json.dump({"book": "封神演义", "generated": "2026-10-03",
           "counting": "最大跨度不重复计次：同一次提及只归给该人物最长的那个写法，不重复累加",
           "summary": {"人物": len(persons), "合称": len(colls),
                       "提及总数": sum(mentions), "台账条目": len(ledger),
                       "讳名单纠正": fixed, "别名下线": len(strip_log)},
           "characters": persons, "collectives": colls,
           "filtered_ledger_classes": sorted({l["class"] for l in ledger}),
           "ledger": ledger,
           "roster_attested": sorted({f for p in persons for f in [p["canonical"]] + list(p["aliases"])
                                      if BOOK.count(f) == 0 and hui_count(f)}),
           "candidates_ge2": sum(1 for c in CANDS.values() if c["count"] >= 2)},
          open(os.path.join(ROOT, "characters.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
D["characters"] = persons
json.dump(D, open(os.path.join(ROOT, "merged-draft.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
with open(os.path.join(ROOT, "人名导入.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(p["canonical"] for p in persons if p["mentions"] >= 1))
print("名单截断复原:", len(rejoined), rejoined[:12])
print("写法改标（原本名 0 次）:", relabel)
zero = [p for p in persons if BOOK.count(p["canonical"]) == 0]
unatt = [p for p in zero if hui_count(p["canonical"]) == 0
         and not any(hui_count(a) for a in p["aliases"]) and p["mentions"] == 0]
print("既无字面出现、也无「讳」格式佐证的条目 → 剔除:", len(unatt),
      [u["canonical"] for u in unatt][:8])
persons[:] = [p for p in persons if p not in unatt]
for u in unatt:
    ledger.append({"candidate": u["canonical"], "count": 0, "class": "剔除（原文无从考证）",
                   "reason": "精读记下的写法既不以连写形式出现，也不符合第99回「姓 讳 名」格式：" +
                             (u.get("identity") or "")[:30]})
print("仍无原文字面出现的人:", len(zero), "（其中讳名单可证:", sum(1 for p in zero if hui_attested(p["canonical"])), "）")
for p in zero[:12]:
    print("   ", p["canonical"], "别名", p["aliases"][:4], "块", p.get("first_chunk"))
contain = [(p, max(BOOK.count(f) for f in [p["canonical"]] + list(p["aliases"]))) for p in persons
           if p["mentions"] < max(BOOK.count(f) for f in [p["canonical"]] + list(p["aliases"]))]
print("提及数 < 最长写法次数（被更长的他人写法占位）:", len(contain))
for p, m in contain[:10]:
    print("   ", p["canonical"], "提及", p["mentions"], "< 写法次数", m)
print("别名剔除（原文查无此写法）:", alias_fix)
print("人物", len(persons), " 提及总数", sum(mentions), " 台账", len(ledger), " 讳名单纠正", fixed)
print("分级:", {lv: sum(1 for p in persons if p["importance"] == lv) for lv in LV_ORDER})
print("非人类:", sum(1 for p in persons if p["nonhuman"]), " 合称:", len(colls))
for p in persons[:12]:
    print(f"  {p['canonical']} {p['mentions']} {p['importance']} 写法{len(p['form_counts'])}")
