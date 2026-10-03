#!/usr/bin/env python3
"""第二通道补漏：直接从原文抽「边界 + 姓名 + 说话/动作动词」的写法，与名单对账。"""
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
SUR = {f[0] for f in FORMS if len(f) >= 2} | set(
    "姜黄姬苏邓陈郑陆袁张孔吕洪韩方余马李杨谢赵王曹侯崇崔蒋窦鄂辛白柏金高姚孙周武罗管闳冒丘申邬常朱戴边彭尹雷龙土云水火木金光灵吉杨任徐萧龙胡刑纪鲍方孙李"
    "费尤杜梅胶黄韩薛陶钮欧张杨李王赵")
SPEECH = "曰道言语"
ACT = "引领上出战被忙慌慌急大叹骂喝问 answer 奏谏辞答对看见听闻思怒喜惧惊闷笑哭叫喊杀擒斩打败胜跑赶回行坐立起住行死伤疼痛别归降逃躲藏"
BOUND = set("。，、；：？！「」『』“”‘’《》〈〉（）()·…—－\n\t ")
PREV = BOUND | set("命着令唤宣召差引擒斩封拜立乃系是为有即却同与和共帅墨")

found = Counter()
pat = re.compile(r"([%s][\u4e00-\u9fa5]{1,3})(?=(?:曰|道|言曰|大声|大喝|大骂|大怒|大喜|大笑|听得|闻得|奏|谏|骂|喝|问|唤|令|领|引|上|出|战))" % "".join(sorted(SUR)))
for m in pat.finditer(BOOK):
    s = m.group(1)
    p = BOOK[m.start() - 1] if m.start() > 0 else "。"
    if p in PREV or p in BOUND:
        found[s] += 1

miss = [(s, n) for s, n in found.items() if s not in FORMS and not any(s in f or f in s for f in FORMS)]
miss.sort(key=lambda x: -x[1])
print("抽到的姓名式写法:", len(found), " 其中不在名单且不为其片段:", len(miss))
for s, n in miss[:80]:
    i = BOOK.find(s)
    print(f"  {s} ×{n} :: {BOOK[max(0,i-16):i+18]}")
json.dump({"miss": [[s, n] for s, n in miss]}, open(os.path.join(ROOT, "recall-probe.json"), "w",
                                                     encoding="utf-8"), ensure_ascii=False, indent=1)
