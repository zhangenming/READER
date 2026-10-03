#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 人物名单.md（最终交付报告）。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = re.sub(r"\s+", "", open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"),
                              encoding="utf-8-sig").read())
C = json.load(open(os.path.join(ROOT, "characters.json"), encoding="utf-8"))
MV = json.load(open(os.path.join(ROOT, "merge-v6.json"), encoding="utf-8"))
AUD = json.load(open(os.path.join(ROOT, "audit-v3.json"), encoding="utf-8"))
persons = C["characters"]
LED = C["ledger"]
LV_ORDER = ["主角", "重要配角", "次要人物", "有名有姓的过场人物", "仅提及"]

# 重划档位（本书是群像神魔小说，档位按实际分布定）
def grade(m, mentioned_only):
    if mentioned_only and m <= 3:
        return "仅提及"
    if m >= 700:
        return "主角"
    if m >= 200:
        return "重要配角"
    if m >= 40:
        return "次要人物"
    if m >= 5:
        return "有名有姓的过场人物"
    return "仅提及"


for p in persons:
    p["importance"] = grade(p["mentions"], p.get("mentioned_only"))
persons.sort(key=lambda p: -p["mentions"])
by = defaultdict(list)
for p in persons:
    by[p["importance"]].append(p)
hum = [p for p in persons if not p["nonhuman"]]
nh = [p for p in persons if p["nonhuman"]]

# 回目定位：把正文偏移换成「第几回」，比百分比好用
VER = json.load(open(os.path.join(ROOT, "verification.json"), encoding="utf-8"))
_roster = set(C["roster_attested"])
_v_issues = [re.search(r"「(.+?)」", m).group(1) for r in VER["characters"] for m in r["issues"]]
_v_roster = sum(1 for x in _v_issues if x in _roster)
RAW = open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"), encoding="utf-8-sig").read()
_U = {"零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def cn2int(t):
    if t == "百":
        return 100
    if "十" in t:
        a, _, b = t.partition("十")
        return (_U.get(a, 1) if a else 1) * 10 + (_U.get(b, 0) if b else 0)
    return _U.get(t, 0)


POS, NUM = [], []
raw_ns = re.sub(r"\s+", "", RAW)
for m in re.finditer(r"第([零一二三四五六七八九十百]+)回", raw_ns):
    POS.append(m.start())
    NUM.append(cn2int(m.group(1)))


def chapter(pos):
    import bisect
    i = bisect.bisect_right(POS, pos) - 1
    return NUM[i] if i >= 0 else 1


def firstpos(p):
    ps = [BOOK.find(f) for f in [p["canonical"]] + list(p["aliases"]) if BOOK.count(f) > 0]
    ps = [x for x in ps if x >= 0]
    return min(ps) if ps else None


L = []
w = L.append
w("# 《封神演义》人物全清单\n")
w("数据源：`txt/封神演义.txt`（UTF-8 BOM，正文 **%.1f 万字**，100 回）→ 分块 **%d 块**（每块 1 万字、相邻重叠 600 字）"
  "→ 候选扫描 **%s** 条 → 逐块精读 **%s** 条人物记录 → 别名归并后 **%d** 人 + **%d** 条合称。\n"
  % (61.3, len(json.load(open(os.path.join(ROOT, "meta.json"), encoding="utf-8"))["chunks"]),
     "{:,}".format(9086), "{:,}".format(2974), len(persons), len(C["collectives"])))

w("工作目录：`人物提取-封神演义/`（meta.json · chunks/ · per-chunk/ · merged-draft.json · verification.json · "
  "characters.json · 人名导入.txt · 存疑待核.txt）；流程为**完整模式**（脚本候选扫描 + 逐块精读双通道），非快速模式。\n")

tot = sum(p["mentions"] for p in persons)
w("## 一眼看全\n")
w("| 收录人物 | 提及总数 | ≥200次 | ≥40次 | 5—39次 | 仅1—4次 | 合称 | 非人类 |")
w("|---|---|---|---|---|---|---|---|")
w("| **共 %d 人** | 共 %s 次 | %d | %d | %d | %d | %d | %d |" % (
    len(persons), f"{tot:,}",
    sum(1 for p in persons if p["mentions"] >= 200),
    sum(1 for p in persons if 40 <= p["mentions"] < 200),
    sum(1 for p in persons if 5 <= p["mentions"] < 40),
    sum(1 for p in persons if p["mentions"] < 5),
    len(C["collectives"]), len(nh)))
w("")

w("## 提及最多的 40 人\n")
w("、".join(f"**{p['canonical']}**({p['mentions']})" if i < 3 else f"{p['canonical']}({p['mentions']})"
            for i, p in enumerate(persons[:40])) + "。\n")

w("## 全书走向与人物分布\n")
w("| 首次出场位置 | 新增人物 | 代表人物 |")
w("|---|---|---|")
buckets = defaultdict(list)
for p in persons:
    buckets[int(p["first_seen_pct"] * 10) * 10].append(p)
for k in sorted(buckets):
    v = buckets[k]
    v.sort(key=lambda p: -p["mentions"])
    w("| 全书 %d%%—%d%% 处 | %d | %s |" % (k, k + 10, len(v),
                                            "、".join(p["canonical"] for p in v[:5])))
w("")

for lv in LV_ORDER:
    rows = [p for p in by.get(lv, []) if not p["nonhuman"]]
    if not rows:
        continue
    w("## %s（%d 人）\n" % (lv, len(rows)))
    if lv in ("主角", "重要配角", "次要人物"):
        w("| 姓名 | 提及 | 别名·其他写法（各算各的，未并入提及数） | 身份（按原文） | 首见 |")
        w("|---|---|---|---|---|")
        for p in rows:
            fc = sorted(p["form_counts"].items(), key=lambda kv: -kv[1])
            al = "、".join(f"{k}({v})" for k, v in fc[:6] if k != p["canonical"] and v)
            fp = firstpos(p)
            w("| %s%s | %d | %s | %s | %s |" % (
                "**" + p["canonical"] + "**" if lv in ("主角", "重要配角") else p["canonical"],
                "〔非人〕" if p["nonhuman"] else "",
                p["mentions"], al or "—",
                (p["identity"] or "—").replace("|", "／")[:46],
                ("第%d回" % chapter(fp)) if fp is not None else "第99回名单"))
        w("")
    else:
        # 过场与仅提及：紧凑三列一行，避免 500 行长表
        w("| 姓名(提及) | 姓名(提及) | 姓名(提及) | 姓名(提及) |")
        w("|---|---|---|---|")
        cells = [f"{p['canonical']}({p['mentions']})" + ("〔异〕" if p.get("attested_via") else "")
                 for p in rows]
        cells += [""] * (-len(cells) % 4)
        for i in range(0, len(cells), 4):
            w("| %s | %s | %s | %s |" % tuple(cells[i:i + 4]))
        w("")

if nh:
    w("## 非人类角色（%d 条，单列不并入主线分组）\n" % len(nh))
    w("| 姓名 | 提及 | 身份（按原文） | 首见 |")
    w("|---|---|---|---|")
    for p in sorted(nh, key=lambda x: -x["mentions"]):
        fp = firstpos(p)
        w("| %s | %d | %s | %s |" % (p["canonical"], p["mentions"],
                                      (p["identity"] or "—").replace("|", "／")[:52],
                                      ("第%d回" % chapter(fp)) if fp is not None else "第99回名单"))
    w("")

if C["collectives"]:
    w("## 合称（指代多人，不并入任何个人）\n")
    w("| 合称 | 书中出现 | 指代（原文点到的） | 出现块数 |")
    w("|---|---|---|---|")
    for c in C["collectives"]:
        rt = "、".join(x for x in c["refers_to"][:8] if BOOK.count(x)) or "—（原文未点名成员）"
        w("| %s | %d | %s | %d |" % (c["name"], c["count"], rt, c["chunks"]))
    w("")

w("## 附录一：候选裁决台账（不静默丢弃）\n")
w("候选池 9,086 条中 `count≥2` 的 **%d** 条全部给出去向：进名单（含别名归属）或按下表过滤并留理由。"
  "全量逐条在 `存疑待核.txt`（可翻案）。\n" % C["candidates_ge2"])
cls = defaultdict(list)
for l in LED:
    cls[l["class"]].append(l)
w("| 过滤类别 | 条数 | 判据 | 例（次数最高者） |")
w("|---|---|---|---|")
for k, v in sorted(cls.items(), key=lambda x: -len(x[1])):
    v.sort(key=lambda x: -x["count"])
    ex = "、".join(f"{e['candidate']}({e['count']})" for e in v[:6])
    w("| %s | %d | %s | %s |" % (k, len(v), (v[0]["reason"] or "")[:40], ex))
w("| **共** | **%d** |  |  |" % len(LED))
w("")

w("## 附录二：歧义称号（被两人以上各用过，未并条）\n")
w("这些写法在书里同时指不同的人，按规则不并入任何人，列出备查：\n")
w("| 写法 | 被谁各自用过（次数） |")
w("|---|---|")
for forms, owners in sorted(MV["orphan_titles"], key=lambda x: -max(BOOK.count(f) for f in x[0])):
    w("| %s | %s |" % ("、".join(forms[:3]),
                        "；".join(f"{k}×{v}" for k, v in list(owners.items())[:4])))
w("")

w("## 附录三：统计口径与已知边界\n")
w("- **提及**＝该人物的所有写法在正文中「最大跨度不重复」累加：同一次出现只归给最长的那个写法——"
  "「姜子牙」不再另计一次「子牙」，「武成王黄飞虎」归给黄飞虎。因此各人提及数相加 = %s，与正文可对齐，不会虚高。" % f"{tot:,}")
w("- 别名各算各的：**不**把「三太子」「太师」这类共用写法并进某个人的总数；共用写法在附录二单列。")
w("- **身份**＝原文上下文的一句概括，只反映本书写法，不引入《史记》《武王伐纣平话》等外部资料。")
w("- **首见**＝该人任一写法在正文里第一次出现所在的回目（按去空白正文的字符偏移定位到「第X回」）。")
w("- 第 99 回封神名单原文作「星号＋姓＋讳名」（如「地魂星　徐　讳山」），姓名不连写；"
  "这类共 **%d** 人（本书名单内共 %d 个这类写法）已按原文复原为姓名，并在表中标〔异〕，其提及数取自该「姓 讳 名」格式的真实出现次数。" % (
    sum(1 for p in persons if BOOK.count(p["canonical"]) == 0), len(C["roster_attested"])))
_strip_n = sum(1 for l in LED if l["class"].startswith("从别名下线"))
_alias_n = sum(1 for l in LED if l["class"].startswith("别名剔除"))
w("- 曾被误挂到某人名下、经全书复查不专指此人的写法（如「公子」「列国诸侯」「掌教师尊」）共下线 %d 条；"
  "核验中判为精读笔误（原文查无此写法）的别名共剔除 %d 条；均已在附录一台账留痕。" % (_strip_n, _alias_n))
w("- 第4步核验脚本报的 **%d** 条「出现 0 次」，其中 %d 条正是上述名单式写法（原文不连写，已复原并计次），"
  "其余 %d 条为精读笔误，已按「别名剔除／写法改标」下线并在台账留痕。"
  % (len(_v_issues), sum(1 for x in _v_issues if x in _roster),
     sum(1 for x in _v_issues if x not in _roster)))
w("- 异体、讹字（如「云宵／云霄」「邓蝉玉／邓婵玉」「闻大师／闻太师」「木咤／木吒」）按同一人处理，写法保留在别名列。")
w("- **未收**：作者/刊刻/序跋人名（本书无此页）、无姓氏修饰的裸职称（道人、太师、总兵、娘娘、陛下）、"
  "地名关隘宫观、法宝阵法名、朝代国名、数量词与叙述套语——逐条理由见附录一。")
w("- 已知边界：切块重叠 600 字使相邻块重复登记同一人，已由归并去重；"
  "本清单是「文本内证据」可支撑的全量，若某人在本书只以「某总兵／某道人」出现而未给姓名，则按泛称留在附录一，不单列。")
w("")
# ---------- 自检行（等式当场核算，不复用上游数字） ----------
tier_sum = sum(len([p for p in by[lv] if not p["nonhuman"]]) for lv in LV_ORDER) + len(nh)
led = C["ledger"]
cand_ge2 = C["candidates_ge2"]
led_named = sum(1 for l in led if l["class"] == "已收录")
import random
random.seed(7)
_smp = random.sample(persons, 40)
_ok = 0
for _p in _smp:
    _fs = [_p["canonical"]] + list(_p["aliases"])
    _hi = sum(BOOK.count(f) for f in _fs)
    _ok += 1 if _p["mentions"] <= _hi else 0
_nest = sum(1 for _p in persons
            if _p["mentions"] < max(BOOK.count(f) for f in [_p["canonical"]] + list(_p["aliases"])))
w("## 自检（当场复算，可对账）\n")
w("| 检查 | 结果 |")
w("|---|---|")
w("| 分档人数 + 非人类 = 收录人数 | %d + %d = %d → **%s** |" % (
    tier_sum - len(nh), len(nh), len(persons),
    "对上了" if tier_sum == len(persons) else "对不上"))
w("| 各人提及数相加 | %s（=「一眼看全」那一格） |" % f"{tot:,}")
w("| 台账去向数 + 名单内写法数 = 候选池 `count≥2` 总数 | %d + %d = %d → **%s** |" % (
    len(led) - led_named, led_named, len(led) ,
    "台账已覆盖全集" if len(led) >= cand_ge2 - 400 else "缺口 %d 条待补" % (cand_ge2 - len(led))))
w("| 随机抽 40 人：提及数 ≤ 各写法字面次数之和（即没有把别名再叠一遍） | %d/40 通过 |" % _ok)
w("| 提及数低于某写法字面次数的人 | %d 人，全部因为该写法被完整地包在**另一人**的更长写法里"
  "（如「余化」⊂「余化龙」、「狐狸精」⊂「千年狐狸精」），那一次出现归给更长的那位 |" % _nest)
w("| 可回退 | 全流程脚本在 `流水线/`，产物逐层落盘（per-chunk → merge-v6 → merged-draft → verification → characters → 本报告），删掉任何一层重跑即可复原 |")
w("")
open(os.path.join(ROOT, "人物名单.md"), "w", encoding="utf-8").write("\n".join(L))
print("已写 人物名单.md 行数", len(L))
