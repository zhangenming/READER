# -*- coding: utf-8 -*-
"""终校：对抽取结果做最后一轮“形状”复核（不重跑抽取）。
把残留的动词尾巴、普通词、地名、粘连串请进存疑层，输出 人名-终校.json。
KEEP 复用 抽取-终版.py 里那份手写权威人名名单，避免另起炉灶。
"""
import io
import json
import os
import re
from collections import Counter

BASE = "/Users/zem/AI/READER"
D = os.path.join(BASE, "tmp", "解放战争-人名")

data = json.load(io.open(os.path.join(D, "人名-终版.json"), encoding="utf-8"))
AB, C1 = data["names"], data["C1"]

# ---- 人工白名单（来自抽取脚本的手写权威名单 + 少量补录）
src = io.open(os.path.join(D, "抽取-终版.py"), encoding="utf-8").read()
KEEP = set()
for tag in ('CCP = """', 'KMT = """', 'OTH = """', 'FORN = """'):
    if tag in src:
        KEEP |= {w for w in re.split(r"\s+", src.split(tag)[1].split('"""')[0]) if 2 <= len(w) <= 5}
KEEP |= {"万毅", "高岗", "李达", "朱德", "贺龙", "陈毅", "林彪", "王震", "罗瑞卿", "康泽", "薛岳", "陈明仁",
         "傅作义", "白崇禧", "杜聿明", "潘朔端", "曾泽生", "王凌云", "郭景云", "邓宝珊", "陶峙岳", "董其武",
         "卢汉", "龙云", "程潜", "罗历戎", "王敬久", "李仙洲", "欧震", "方先觉", "宋希濂", "王克俊", "阎揆要",
         "江渭清", "韦国清", "杨斯德", "杜任之", "温天和", "陈正湘", "唐天际", "王其梅", "李汉魂", "颜惠庆",
         "章士钊", "邵力子", "司徒雷登", "赛福鼎", "乌兰夫", "阿沛", "张闻天", "李维汉", "贾拓夫", "邓颖超",
         "蔡畅", "曾山", "彭真", "陈云", "叶挺", "项英", "马得胜", "卢胜", "张挺", "王贵得", "周士第", "裴昌会",
         "冯仲云", "张霖之", "杜建时", "鲁湘云", "邱维达", "陈林达", "顿星云", "钟子云", "李华堂", "彭克立"}

import jieba
DICT_NR, DICT_WORD, DICT_FREQ, DICT_GEO, DICT_ORG = set(), set(), {}, set(), set()
for ln in io.open(os.path.join(os.path.dirname(jieba.__file__), "dict.txt"), encoding="utf-8"):
    p = ln.split()
    if len(p) < 3:
        continue
    w, fr, tg = p[0], int(p[1]), p[2]
    DICT_FREQ[w] = max(DICT_FREQ.get(w, 0), fr)
    if tg.startswith("nr"):
        DICT_NR.add(w)
    elif tg in ("ns", "nsf"):
        DICT_GEO.add(w)
    elif tg in ("nt", "nz"):
        DICT_ORG.add(w)
    elif tg in ("n", "v", "vd", "vn", "a", "ad", "an", "d", "r", "p", "c", "u", "f", "s", "l", "j",
                "t", "m", "q", "i", "eng", "un", "x"):
        DICT_WORD.add(w)

# 只收“几乎不会作为人名末字”的字
TAIL_CHARS = set("了着在也又再更此那这其所或且即则很样般似们应答说问告部主负败回知求话加经论讲称别送往下去等")
# 只收“几乎不会作为人名首字”的字（万/高/何等大姓不在其中）
BAD_START = set("和与或及并而但却一二三四五六七八九十百千大小没每各另别再还太些该此由已未非是向着给对")
GEO_TAIL = set("庄屯都县坡沟堡寨站隘甸庵铺集营坪垸岙峒湄堨堰坝坊巷沿滨涯垴峦")
VERB_TAIL = ["率领", "率部", "下达", "指挥", "解释", "强调", "指出", "回答", "报告", "汇报", "命令", "致电",
             "复电", "说道", "称道", "决定", "认为", "表示", "同意", "建议", "承认", "回忆", "交代", "通知",
             "号召", "参加", "担任", "兼任", "代理", "就任", "调任", "特别", "以及", "立即", "马上", "突然",
             "继续", "仍然", "仍旧", "正在", "已经", "先后", "一直", "一致", "一起", "一律", "一定", "一边",
             "一面", "一样", "一般", "一处", "一点", "一堆", "一群", "一批", "一件", "一份", "一名", "一片",
             "一组", "一次", "一位", "一切", "所有", "有关", "有利", "有人", "有事", "有些", "有点", "有效",
             "情况下", "条件", "办法", "方法", "方式", "方面", "方向", "形势", "情况", "情形", "大会上", "会上"]
WORD_TAIL = {w for w in DICT_WORD if DICT_FREQ.get(w, 0) >= 1500}
GLUE_HEAD = set("向对为以把被给从并及其该此如亦再更且即虽则然因缘由之等和与同或还又只挨照按依照根据关于至于连")
EXPLICIT_DENY = set("""任第 里地 向第 兼第 于第 说着 史说 个月来 一句话 方法是 都参加 邓为 力为 段回 电报还
电报中还 指挥的第 章第 小礼堂 于民 恩达 率领下 朱德总 陈赓大 彭德怀一 胡宗南一 胡宗南要 林彪等人 都发了言
还有的人 力已达 德惠之敌 都到齐 电称一节 傅先生 高兴地 解参谋长 陆军总 国民党兵 主力向西 于攻坚 小敌
带领下 年纪老了 何情况下 山东和华 马歇尔一 曾生回忆 党的工作 中央指示 西北人民 山地作战 电报同时 早下决心
关于作战 刘其人为 邓为政治 钟松继续 向山东 到山东 过江南 沿平汉 指东北 司令员兼 政治委员兼 晋绥野战
朱德总司令 毛主席 晋察冀 华东野战 东北野战 中原野战""".split())

moved = []
order = sorted(AB, key=lambda k: -AB[k]["mentions"])
for w in list(order):
    e = AB.get(w)
    if e is None or w in KEEP or "·" in w:
        continue
    hard = sum(1 for k in ("bio", "rankT", "rankB", "quote", "alias", "foreign") if e["ev"].get(k))
    why = None
    if w in EXPLICIT_DENY:
        why = "explicit"
    elif w[0] in BAD_START and w not in DICT_NR:
        why = "bad-start"
    elif len(w) >= 2 and w[-1] in GEO_TAIL and w not in DICT_NR:
        why = "geo-tail"
    elif w[-1] in TAIL_CHARS and w not in DICT_NR:
        why = "tail-char"
    elif len(w) >= 3 and any(w.endswith(t) for t in VERB_TAIL):
        why = "verb-tail"
    elif len(w) >= 4 and w[-2:] in WORD_TAIL:
        why = "word-tail"
    elif w in DICT_GEO or w in DICT_ORG:
        why = "geo-org"
    elif w in WORD_TAIL and w not in DICT_NR and hard < 2:
        why = "dict-word"
    else:
        for L in order:
            if L == w or L not in AB or len(L) < 2 or AB[L]["mentions"] < e["mentions"]:
                continue
            extra = len(w) - len(L)
            if extra <= 0 or extra > 3:
                continue
            if w.startswith(L) and all(c in TAIL_CHARS or c in GLUE_HEAD for c in w[len(L):]):
                why = "glue-after"
                break
            if w.endswith(L) and extra <= 2 and all(c in GLUE_HEAD or c in TAIL_CHARS for c in w[:-len(L)]):
                why = "glue-before"
                break
    if why:
        C1[w] = dict(e, tier="C1")
        AB.pop(w)
        moved.append((w, why))

print("终校请出 %d 条，主表剩 %d" % (len(moved), len(AB)))
print("理由分布：", Counter(r for _, r in moved).most_common())
print("例子：", "  ".join("%s(%s)" % (w, r) for w, r in moved[:50]))
data["names"], data["C1"] = AB, C1
io.open(os.path.join(D, "人名-终校.json"), "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False))
