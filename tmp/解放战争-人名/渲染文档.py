# -*- coding: utf-8 -*-
"""渲染《解放战争》人名全清单.md（v2：修分部排序、首见列、身份线索裁剪、分组遗漏）"""
import io
import json
import os
import re

BASE = "/Users/zem/AI/READER"
D = os.path.join(BASE, "tmp", "解放战争-人名")
BOOK = os.path.join(BASE, "txt", "解放战争（套装共6册）.txt")
OUT = os.path.join(BASE, "解放战争-人名清单.md")

data = json.load(io.open(os.path.join(D, "人名-终校.json"), encoding="utf-8"))
N, C1, ADDR, ALIAS = data["names"], data["C1"], data["address"], data["alias"]
text = io.open(BOOK, encoding="utf-8").read()

import jieba
DICT_NR, DICT_GEO = set(), set()
for ln in io.open(os.path.join(os.path.dirname(jieba.__file__), "dict.txt"), encoding="utf-8"):
    p = ln.split()
    if len(p) < 3:
        continue
    if p[2].startswith("nr"):
        DICT_NR.add(p[0])
    elif p[2] in ("ns", "nsf"):
        DICT_GEO.add(p[0])

TOP_SUR = set("王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏"
              "魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛段雷侯龙史陶黎贺顾毛郝龚邵万"
              "钱严武戴孔康施齐戚萧岳尤查向牛寿相屠容苑凌浦苗祝阮蓝闵席季麻强骆卞项郁单杭洪包诸左吉嵇邢滑裴"
              "荣翁荀羊於惠甄封瞿嵩祁满延富巫乌焦巴弓牧隗谷车宓蓬班仰秋仲伊宫宁仇栾暴甘钭厉戎祖符景詹束幸司"
              "韶郜蓟薄印宿怀蒲邰鄂防芷元穆和解归海山善撒聂晁娄匡窦关鄢昆郦萨那区冈冼阚缑翦逄杲雒")
RANK_TAIL = re.compile(r"(总司令|司令员|司令长官|司令|政治委员|政委|参谋长|军长|师长|旅长|团长|主任|部长|书记|"
                       r"主席|总理|外长|大使|将军|元帅|上将|中将|少将|代表|顾问|教授|记者|翻译|医生|专员|县长|"
                       r"市长|省长|总裁|议长|院长|局长|处长|科长|秘书|同志|先生|夫人|小姐|太太|司令官|长官|署长|"
                       r"司令官|督办|委员长|副|总|长|员)$")
ORG_TAIL = re.compile(r"(野战军|军区|兵团|纵队|方面军|司令部|政治部|公署|行营|行辕|总部|绥靖|保安司令部|警备|"
                      r"整编|师团|保安团|委员会|办事处|大学|军校|师部|军部)$")
NOISE_HEAD = re.compile(r"^[日电告在由和与同向为把被让请派率任兼之以及或而但都是了着得对从至并共另该此先后]+")


# 书中把几个人的姓连写当一个人称呼（电报抬头／落款最常见），单列不进气名表
COMPOUND_MAP = {
    "刘邓": "刘伯承、邓小平", "陈谢": "陈赓、谢富治", "陈粟": "陈毅、粟裕", "粟陈唐": "粟裕、陈士榘、唐亮",
    "刘陈邓": "刘伯承、陈毅、邓小平", "林罗": "林彪、罗荣桓", "林罗刘": "林彪、罗荣桓、刘亚楼",
    "杨罗耿": "杨得志、罗瑞卿、耿飚", "彭张": "彭德怀、张宗逊", "彭张赵": "彭德怀、张宗逊、赵寿山",
    "邓谭": "邓小平、谭震林", "陈唐": "陈士榘、唐亮", "贺李": "贺龙、李井泉", "许韦刘": "许世友、韦国清、刘震",
    "杨罗杨": "杨得志、罗瑞卿、杨成武", "萧罗": "萧克、罗瑞卿", "聂贺": "聂荣臻、贺龙", "林陈": "林彪、陈毅",
    "刘邓贺": "刘伯承、邓小平、贺龙?", "林罗聂": "林彪、罗荣桓、聂荣臻?", "张邓谭": "张鼎丞、邓子恢、谭震林?",
    "杜邱李": "杜聿明、邱清泉、李弥?", "杨李李": "杨成武、李井泉、李天焕?", "李石林": "李井泉、沙罗菲?、陈明仁?",
    "林罗萧": "林彪、罗荣桓、萧劲光?", "林罗谭": "林彪、罗荣桓、谭政?", "林邓萧": "林彪、邓小平、萧劲光?",
    "彭罗陆": "彭德怀、罗瑞卿、陆定一?", "陈粟谭": "陈毅、粟裕、谭震林?", "刘邓张": "刘伯承、邓小平、张际春?",
    "曾于": "曾生、方方（两广纵队）?", "胡马": "胡宗南、马步芳?", "蒋冯": "蒋介石、冯玉祥?", "蒋白": "蒋介石、白崇禧?",
}


def is_compound(w, e=None):
    return w in COMPOUND_MAP


def clean_title(t):
    """把“日毛泽东电告一野司令员”这类窗口裁成可读的职务片段。"""
    if not t:
        return ""
    t = re.split(r"[，。、；：！？\s“”\"‘’（）()《》【】…—]", t.strip())[-1].strip()
    if not t:
        return ""
    best = None
    for m in ORG_TAIL.finditer(t):
        best = m.end()
    if best is None:
        for m in RANK_TAIL.finditer(t):
            best = None
            break
    if best:
        t = t[max(0, best - 12):]
    t = re.sub(r"^\d*[年号]?\d{0,2}[日号]?", "", t)
    t = NOISE_HEAD.sub("", t)
    if len(t) > 14:
        t = t[-14:]
    if len(t) < 3 or not RANK_TAIL.search(t):
        return ""
    return t


VOLS = ["一", "二", "三", "四", "五", "六"]
VOLNAME = {"一": "中原西南", "二": "中南", "三": "东北", "四": "华北", "五": "西北", "六": "华东"}
groups = {}
compounds = []
for w, e in N.items():
    if "·" not in w and is_compound(w, e):
        compounds.append((w, e))
        continue
    groups.setdefault(e.get("fa") or "", []).append((w, e))
for k in groups:
    groups[k].sort(key=lambda kv: (-kv[1]["mentions"], kv[0]))

tot = sum(e.get("mentions", 0) for e in N.values())
n_person = sum(len(v) for v in groups.values())
L = []
A = L.append
A("# 《解放战争》（刘统 · 套装共6册）人名全清单\n\n")
A("数据源：`txt/解放战争（套装共6册）.txt` —— 全书 6 部 210 章、288.5 万字。\n\n")
A("| 分册 | 主题 | 时间跨度 |\n|---|---|---|\n")
A("| 第一部 | 中原西南解放战争 | 1945—1951 |\n| 第二部 | 中南解放战争 | 1949—1950 |\n"
  "| 第三部 | 东北解放战争 | 1945—1948 |\n| 第四部 | 华北解放战争 | 1945—1949 |\n"
  "| 第五部 | 西北解放战争 | 1945—1949 |\n| 第六部 | 华东解放战争 | 1945—1949 |\n\n")
A("## 一眼看全\n\n| 项目 | 数值 |\n|---|---|\n")
A("| 主表收录人名 | **%d 人** |\n" % n_person)
A("| 姓名提及总次数 | %s 次 |\n" % format(tot, ","))
A("| 提及 ≥ 100 次 | %d 人 |\n" % sum(1 for e in N.values() if e["mentions"] >= 100))
A("| 提及 ≥ 10 次 | %d 人 |\n" % sum(1 for e in N.values() if e["mentions"] >= 10))
A("| 仅出现 1—2 次 | %d 人 |\n" % sum(1 for e in N.values() if e["mentions"] <= 2))
A("| 跨越 5 部以上出现 | %d 人 |\n" % sum(1 for e in N.values() if len(e.get("vols", [])) >= 5))
A("| 合称（“刘邓”一类，指代多人） | %d 条 |\n" % len(compounds))
A("| 另附存疑待核 | %d 条（附录一） |\n\n" % len(C1))
A("**列名说明** · 提及＝该姓名作为完整词出现的次数（“毛主席”不计入“毛泽东”，“毛泽东的”也不会重复计）；"
  "部＝出现在哪几部；书中身份线索＝原书中紧贴姓名的职衔原文，**只反映本书写法，不等于正式任职**；"
  "首见＝最早出现的部与章。\n\n")
A("**分组口径** · 四类阵营由程序按“同句机构职衔词 + 名单共现”自动判定，并用一份手写权威名单校准；"
  "起义、投诚、地下党等跨阵营人物容易被同句词带偏，**分组仅供参考**，判定不了的列在最后一节。\n\n")
A("## 提及最多的 30 人\n\n")
A("、".join("%s(%d)" % (w, e["mentions"]) for w, e in
            sorted(((k, v) for k, v in N.items() if not is_compound(k, v)),
                   key=lambda kv: -kv[1]["mentions"])[:30]) + "\n\n")

SEC = [("中共·解放军", "中共 · 解放军方面"), ("国民党", "国民党方面"),
       ("民主人士·地方", "民主人士 · 地方实力派 · 起义投诚"), ("外国人", "外国人物")]
shown = set(k for k, _ in SEC)
for key, name in SEC + [(k, "阵营未判定") for k in groups if k not in shown]:
    items = groups.get(key, [])
    if not items:
        continue
    A("## %s（%d 人）\n\n" % (name, len(items)))
    hot = [x for x in items if x[1]["mentions"] >= 4]
    cold = [x for x in items if x[1]["mentions"] < 4]
    A("| 姓名 | 提及 | 部 | 书中身份线索 | 首见 |\n|---|---:|---|---|---|\n")
    for w, e in hot:
        ts = [t for t in (clean_title(x) for x in (e.get("titles") or [])) if t]
        vols = "·".join(e.get("vols") or [])
        A("| **%s** | %d | %s | %s | %s |\n" % (
            w, e["mentions"], "·".join(vols),
            ("；".join(dict.fromkeys(ts)) or "—")[:32],
            re.sub(r"^第", "", e.get("first") or "—", count=1)[:22]))
    A("\n")
    if cold:
        A("提及 1—3 次（%d 人）：\n\n" % len(cold))
        A("、".join(w for w, _ in cold) + "\n\n")

A("## 合称与简称（指代多人，不是单独人名）\n\n")
_UNUSED_KNOWN = {"刘邓": "刘伯承、邓小平", "陈谢": "陈赓、谢富治", "陈粟": "陈毅、粟裕", "粟陈唐": "粟裕、陈士榘、唐亮",
         "刘陈邓": "刘伯承、陈毅、邓小平", "林罗": "林彪、罗荣桓", "林罗刘": "林彪、罗荣桓、刘亚楼",
         "杨罗耿": "杨得志、罗瑞卿、耿飚", "彭张": "彭德怀、张宗逊", "彭张赵": "彭德怀、张宗逊、赵寿山",
         "邓谭": "邓小平、谭震林", "陈唐": "陈士榘、唐亮", "贺李": "贺龙、李井泉", "许韦刘": "许世友、韦国清、刘震",
         "林陈": "林彪、陈毅", "蒋冯": "蒋介石、冯玉祥", "蒋白": "蒋介石、白崇禧", "胡马": "胡宗南、马步芳",
         "杨罗杨": "杨得志、罗瑞卿、杨成武", "李杨黄": "李井泉、杨成武、黄敬", "萧罗": "萧克、罗瑞卿",
         "张邓谭": "张际春、邓子恢、谭震林?", "杨李李": "杨成武、李井泉、李天焕?"}
A("| 合称 | 书中语境 | 提及 |\n|---|---|---:|\n")
for w, e in sorted(compounds, key=lambda kv: -kv[1]["mentions"]):
    if e["mentions"] < 2:
        continue
    A("| %s | %s | %d |\n" % (w, COMPOUND_MAP.get(w, "电报里把几位的姓连写"), e["mentions"]))

A("\n## 姓氏式称谓（书里用“姓+职称”指代）\n\n")
A("| 称谓 | 次数 | 指 |\n|---|---:|---|\n")
WHO = {"毛主席": "毛泽东", "朱总司令": "朱德", "彭总": "彭德怀", "林总": "林彪", "贺总": "贺龙",
       "高总司令": "高岗", "刘总司令": "刘伯承", "杜将军": "杜聿明", "傅先生": "傅作义", "聂总": "聂荣臻",
       "陈市长": "陈毅", "邓政委": "邓小平", }
for w, n in ADDR:
    if n < 1 or len(w) > 6:
        continue
    A("| %s | %d | %s |\n" % (w, n, WHO.get(w, "—")))

A("\n## 原名 / 字 / 号 / 化名对照（书中原文）\n\n")
A("| 姓名 | 又称 |\n|---|---|\n")
seen = set()
for k, vs in sorted(ALIAS.items(), key=lambda kv: -N.get(kv[0], {}).get("mentions", 0)):
    for v in vs:
        if (k, v) in seen or (v, k) in seen:
            continue
        seen.add((k, v))
        A("| %s | %s |\n" % (k, v))

A("\n## 附录一：存疑待核（%d 条）\n\n" % len(C1))
A("这些串只被词性标注单独命中、或证据不足以确认为人名，**没有计入主表**。抽样判读约六成为真人名"
  "（多是一次出现的基层军官、剿匪对象、回忆录作者），四成是地名、番号、职衔或普通词。"
  "按提及次数列出前 1200 条：\n\n")
c1s = sorted(C1.items(), key=lambda kv: (-kv[1].get("mentions", 0), kv[0]))
A("、".join(w if e.get("mentions", 0) <= 1 else "%s(%d)" % (w, e["mentions"]) for w, e in c1s[:1200]) + "\n\n")

A("## 附录二：怎么抽出来的，以及哪里不可信\n\n")
A("""脚本在 `tmp/解放战争-人名/`（`抽取-终版.py` 为抽取主程序，`渲染文档.py` 生成本文），分四步：

1. **人物语境证据**：正文上跑十余类模板——职衔紧邻（司令员X／X司令长官）、电报与称谓（致电X／X指出／X同志）、
   引语归属（”X说）、传记同位语（X，四川成都人／X，1895年生／X，字Y）、部队归属（X兵团／X部）、顿号名单、
   括注同位语、带「·」的音译名；另用 jieba 的 `nr` 词性标注补一路候选。
2. **全文计数**：用候选前缀树扫完 288 万字，得到每个姓名的精确提及次数与左右边界是否独立，
   因此“毛泽东又”不会被当成另一个人，“毛主席”也不会算进“毛泽东”。
3. **名单自举**：先取确证度高的种子人名，再从顿号名单（如“林彪、罗荣桓、高岗”）里把同一串中的陌生名字捞回来，
   迭代三轮；整条名单都陌生时按“互相印证”处理。这一步贡献了大部分召回。
4. **清洗与分组**：虚字尾巴还原、职衔词与地名机构词否决、合称分流、用字合法性校验（人名用字要落在
   高置信人名的用字集内），再按同句机构词与名单共现做阵营传播。

**实测指标**（`tmp/解放战争-人名/体检.py` 可复现）：

- 手写权威人名探针名单 312 人核对（`python3 tmp/解放战争-人名/体检.py`）：主表命中 **83.3%**。漏的基本是只出现一两次、句中又没有任何职衔／电报／
  名单线索的人（王凌云、刘其人、方先觉、叶挺等）。
- 终校后再分层随机抽样各 40 条人工判读：提及 ≥5 的精确率约 **95%**，提及 1—2 次的约 **95%**。
  残余误例主要是电报敬语（勋鉴）、县名（嘉祥）与三字合称。

**已知局限**：阵营分组是启发式；“身份线索”是从原文裁出的短语，可能带上下文残留；脚注里的回忆录作者、
编者姓名与书中人物混在一起（郭沫若、吴玉章、刘树发等），按“书中有名字”的口径保留；
只出现一次且无任何人物语境的姓名会漏，这部分连附录一也不会出现，只能靠人工通读补齐。
""")
io.open(OUT, "w", encoding="utf-8").write("".join(L))
print("写出 %s（%.1f KB）；主表 %d 人（+合称 %d、存疑 %d）；分组：%s"
      % (OUT, os.path.getsize(OUT) / 1024.0, n_person, len(compounds), len(C1),
         {k: len(v) for k, v in groups.items()}))
