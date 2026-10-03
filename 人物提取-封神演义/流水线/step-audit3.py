#!/usr/bin/env python3
"""召回审计 v3：用「词边界 + 后接动词」严判未覆盖候选里真正像人名的部分。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"), encoding="utf-8-sig").read()
BOOK = re.sub(r"\s+", "", RAW)
CANDS = json.load(open(os.path.join(ROOT, "candidates.json"), encoding="utf-8"))
DRAFT = json.load(open(os.path.join(ROOT, "merged-draft.json"), encoding="utf-8"))
MV = json.load(open(os.path.join(ROOT, "merge-v6.json"), encoding="utf-8"))

KNOWN = []
for c in DRAFT["characters"]:
    KNOWN += [c["canonical"]] + list(c["aliases"])
for col in DRAFT["collectives"]:
    KNOWN += [col["name"]] + list(col["refers_to"])
KNOWN = sorted(set(KNOWN), key=len, reverse=True)
KW = set(KNOWN)
JUNK = set(MV["junk_forms"]) | set("""太师 道人 天子 元帅 真人 门人 道兄 老师 大夫 大王 二将 老爷 圣母
天尊 夫人 童子 师叔 道者 贤弟 主将 君侯 师尊 公主 童儿 千岁 总兵 先生 四人 圣人 道童 使命 先行官
军政官 奉御官 中大夫 上大夫 丞相 殿下 陛下 娘娘 员外 娘子 官军 天下诸侯 四海 道德 后人有诗""".split())
BOUND = set("。，、；：？！「」『』“”‘’《》〈〉（）()·…—－\n\t ")
PREV_OK = BOUND | set("命着令唤宣召差引擒斩封拜立乃系是为有即却同与和共帅乃着却乃")
NEXT_OK = BOUND | set("曰道言行兵将马军阵前营中帐下内外出入战杀擒斩败胜死活伤病怒喜惧惊闷思听说闻见视听掌镇守管统提督率引领上下去来回赶追打骂笑哭奏谏辞答对问对")
FUNC = set("不无未岂何乃则皆尽总只却便就方才已亦且又复仍相共各每所有这那就都是我了着过给被把将对向从以而为之乎者也其此彼该等等之等")
SUR = {k[0] for k in KW if len(k) >= 2} | set("""姜黄姬苏邓陈郑陆袁张孔吕洪韩方余马李杨谢赵王曹侯崇崔蒋窦鄂辛白柏金高姚孙
周武罗管闳冒丘申龙吉法戒徐敖邬常朱戴辛免辛边彭祖彭姚尹魏贲杨任田石矶灵吉卢彭礼陶陶荣钟芳雷雷震土水木火土""".split())
SUR = {c for c in SUR if len(c) == 1}


def free_hits(nm):
    """至少一次「独立出现」：前有边界/及物动词，后接边界/动词，且不是更长已收录写法的一部分。"""
    n, free = 0, 0
    i = BOOK.find(nm)
    while i >= 0:
        n += 1
        p = BOOK[i - 1] if i > 0 else "。"
        x = BOOK[i + len(nm)] if i + len(nm) < len(BOOK) else "。"
        inside = any(nm != k and nm in k for k in KW)
        if not inside and p in PREV_OK and x in NEXT_OK:
            free += 1
        i = BOOK.find(nm, i + 1)
    return n, free


classes = defaultdict(list)
review = []
for cand in CANDS:
    nm, cnt = cand["name"], cand["count"]
    if cnt < 2:
        continue
    if nm in KW:
        classes["已收录"].append({"candidate": nm, "count": cnt, "reason": "名单内已有该写法"})
        continue
    if any(nm in k and k != nm for k in KW):
        classes["跨名n元组"].append({"candidate": nm, "count": cnt,
                                       "reason": "是已收录写法的截断/跨界片段，提及已随全名计"})
        continue
    if any(k in nm for k in KW if len(k) >= 2):
        classes["跨名n元组"].append({"candidate": nm, "count": cnt,
                                       "reason": "内含已收录写法，属切词跨界词组，非独立人名"})
        continue
    if nm in JUNK:
        classes["泛称·裸职称·处所通名"].append({"candidate": nm, "count": cnt,
                                                  "reason": "无姓氏修饰的称谓/官职，不特指某人（规则§1）"})
        continue
    if any(ch in FUNC for ch in nm):
        classes["叙述常用语"].append({"candidate": nm, "count": cnt,
                                        "reason": "含虚词的叙述词组，非人名"})
        continue
    n, free = free_hits(nm)
    if free == 0:
        classes["嵌在更长词组中的切词碎片"].append({"candidate": nm, "count": cnt,
                                                      "reason": "全书没有一次独立成词出现（前无边界/后无动词）"})
        continue
    review.append({"name": nm, "count": cnt, "free": free,
                   "ctx": (cand.get("contexts") or [""])[0][:60]})

print("解释掉的候选：", {k: len(v) for k, v in sorted(classes.items(), key=lambda x: -len(x[1]))})
print("待人工过目的未覆盖候选:", len(review))
for r in sorted(review, key=lambda x: -x["count"])[:60]:
    print(f"  {r['name']} ×{r['count']}(独立{r['free']}) :: {r['ctx']}")
json.dump({"classes": classes, "review": review},
          open(os.path.join(ROOT, "audit-v3.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
