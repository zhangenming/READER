# -*- coding: utf-8 -*-
"""渲染《解放战争》按部（分册）人名清单：解放战争-人名-分册清单.md"""
import io
import json
import os
import re

BASE = "/Users/zem/AI/READER"
D = os.path.join(BASE, "tmp", "解放战争-人名")
OUT = os.path.join(BASE, "解放战争-人名-分册清单.md")

main = json.load(io.open(os.path.join(D, "人名-终校.json"), encoding="utf-8"))
N = main["names"]
per = json.load(io.open(os.path.join(D, "分册计数.json"), encoding="utf-8"))

VOLS = ["一", "二", "三", "四", "五", "六"]
SUB = {"一": "中原西南解放战争 1945—1951", "二": "中南解放战争 1949—1950",
       "三": "东北解放战争 1945—1948", "四": "华北解放战争 1945—1949",
       "五": "西北解放战争 1945—1949", "六": "华东解放战争 1945—1949"}
FA = {"中共·解放军": "中共", "国民党": "国民党", "民主人士·地方": "其他", "外国人": "外国", "": "—"}
COMPOUND = {"刘邓", "陈谢", "陈粟", "刘陈邓", "聂贺", "林罗聂"}

RANK_RE = re.compile(r"(总司令|司令员|司令长官|司令|政治委员|政委|参谋长|军长|师长|旅长|团长|主任|部长|书记|"
                     r"主席|总理|外长|大使|将军|元帅|上将|中将|少将|代表|顾问|教授|记者|翻译|医生|专员|县长|"
                     r"市长|省长|总裁|议长|院长|局长|处长|科长|秘书|同志|先生|夫人|小姐|太太|司令官|长官|署长|"
                     r"委员长|主编|社长|编辑|发行人|参议员|代表)")
NOISE_HEAD = re.compile(r"^\d*[年号]?\d{0,2}[日号]?")


def clean_title(t):
    if not t:
        return ""
    t = re.split(r"[，。、；：！？\s“”\"‘’（）()《》【】…—]", t.strip())[-1].strip()
    if not t:
        return ""
    ends = [m.end() for m in RANK_RE.finditer(t)]
    t = t[max(0, ends[-1] - 12):] if ends else t[-12:]
    t = NOISE_HEAD.sub("", t)
    t = re.sub(r"^[日电告在由和与同向为把被让请派率任兼之以及或而但都是了着得对从至并共另该此先后体]+", "", t)
    return t if (len(t) >= 3 and len(t) <= 16 and RANK_RE.search(t)) else ""


# 每个名字出现在哪几部（用分册计数结果，比原来按证据行统计更准）
appears = {w: [v for v in VOLS if w in per.get(v, {})] for w in N}

L = []
A = L.append
A("# 《解放战争》人名清单 · 按部（分册）拆分\n\n")
A("数据源 `txt/解放战争（套装共6册）.txt`（6 部 210 章、288.5 万字）。人名口径与"
  "[解放战争-人名清单.md](解放战争-人名清单.md) 完全一致（同一份主表 1198 人），"
  "这份只是**按册拆开**，并给出每个人在该册的提及次数与本册首见章。\n\n")
A("## 分册概览\n\n")
A("| 部 | 主题 | 该册人名数 | 该册提及合计 | 仅在该册出现 | 该册提及最多的 5 人 |\n")
A("|---|---|---:|---:|---:|---|\n")
for v in VOLS:
    d = {w: x["n"] for w, x in per[v].items() if w not in COMPOUND}
    only = sum(1 for w in d if len(appears[w]) == 1)
    top5 = "、".join("%s(%d)" % (w, n) for w, n in sorted(d.items(), key=lambda kv: -kv[1])[:5])
    A("| 第%s部 | %s | %d | %s | %d | %s |\n" % (v, SUB[v], len(d), format(sum(d.values()), ","), only, top5))
alln = sum(1 for w in N if w not in COMPOUND)
A("\n全书合计 **%d 人**（不含合称）；其中出现在 2 部及以上 %d 人，只出现在 1 部 %d 人。\n\n"
  % (alln, sum(1 for w in N if w not in COMPOUND and len(appears[w]) >= 2),
     sum(1 for w in N if w not in COMPOUND and len(appears[w]) == 1)))
A("**跨册流动本身是个信号**：一个名字只出现在一部，多半是该战场的中下级指挥员或地方人物；"
  "贯穿六部的（毛泽东、蒋介石、周恩来、朱德、刘少奇、聂荣臻、陈毅、彭德怀等）才是全局人物。\n\n")

for v in VOLS:
    d = {w: x for w, x in per[v].items() if w not in COMPOUND}
    hot = sorted(((w, x) for w, x in d.items() if x["n"] >= 3), key=lambda kv: -kv[1]["n"])
    low = sorted(((w, x) for w, x in d.items() if x["n"] < 3), key=lambda kv: kv[0])
    uniq = sorted((w for w in d if len(appears[w]) == 1), key=lambda w: -d[w]["n"])
    A("## 第%s部 · %s（%d 人）\n\n" % (v, SUB[v], len(d)))
    A("| 姓名 | 本册 | 全书 | 哪几册 | 阵营 | 书中身份线索 | 本册首见 |\n")
    A("|---|---:|---:|---|---|---|---|\n")
    for w, x in hot:
        e = N[w]
        ts = [t for t in (clean_title(t) for t in (e.get("titles") or [])) if t]
        A("| **%s** | %d | %d | %s | %s | %s | %s |\n" % (
            w, x["n"], e["mentions"], "·".join(appears[w]), FA.get(e.get("fa") or "", e.get("fa") or "—"),
            ("；".join(dict.fromkeys(ts)) or "—")[:28], (x["first"] or "—")[:20]))
    A("\n本册出现 1—2 次（%d 人）：\n\n" % len(low))
    A("、".join(w for w, _ in low) + "\n\n")
    if uniq:
        A("仅见于本册（%d 人，按本册提及次数序）：\n\n" % len(uniq))
        A("、".join("%s(%d)" % (w, d[w]["n"]) for w in uniq[:400]) + "\n\n")
    cm = {w: per[v][w]["n"] for w in COMPOUND if w in per.get(v, {}) and per[v][w]["n"] >= 3}
    if cm:
        A("本册合称（电报里把几位的姓连写，指代多人）："
          + "、".join("%s(%d)" % (w, n) for w, n in sorted(cm.items(), key=lambda kv: -kv[1])) + "\n\n")

A("## 口径与局限\n\n")
A("""- 分册归属按正文里“第N部　决战：…”这一行划分，每部的版权页与图片说明跟着该部一起算，"
  所以编辑出版人员名单（齐书深、楼岚岚等）会计入所属部。
- “本册提及”＝该姓名在这一册里作为完整词出现的次数，用同一棵候选前缀树扫描得出，"
  不会把“毛主席”算进“毛泽东”，也不会把“毛泽东又”当成第二个人。
- “阵营”沿用总清单的自动判定（同句机构职衔词 + 名单共现传播），起义、投诚、地下党人物容易被带偏。
- “书中身份线索”是从原书紧贴姓名的文字里裁出来的短语，可能有上下文残留，只反映本书写法。
- 抽取的整体精确率与召回率（探针召回 83.3%、抽样精确率约 95%）以及漏在何处，"
  见总清单附录二；按部拆分不会改变这些误差，只是把同一批人换个轴排开。
""")
io.open(OUT, "w", encoding="utf-8").write("".join(L))
print("写出 %s（%.1f KB）" % (OUT, os.path.getsize(OUT) / 1024.0))
