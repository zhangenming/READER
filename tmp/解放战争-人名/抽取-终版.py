# -*- coding: utf-8 -*-
"""《解放战争》人名抽取 终版。

四个阶段：
  1 证据：职务邻近、电报/称谓、引语、传记同位语、“X部/X兵团”、顿号名单（宽松版）、音译名
  2 计数：候选前缀树全文扫描 -> 精确提及次数 + 干净右边界次数
  3 分层：确证 A / 主表 B / 存疑 C1（词性标注单独命中）/ 噪声 C2（只报数量）
  4 清洗：虚字尾巴去重与还原、地名形态剔除、姓氏合称归档、阵营标签传播
输出 tmp/解放战争-人名/人名-终版.json
"""
import io
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict

BASE = "/Users/zem/AI/READER"
BOOK = os.path.join(BASE, "txt", "解放战争（套装共6册）.txt")
D = os.path.join(BASE, "tmp", "解放战争-人名")
CJ = "一-鿿"
t0 = time.time()

lines = io.open(BOOK, encoding="utf-8").read().split("\n")
raw = "\n".join(lines)

# ------------------------------------------------------------------ 篇章定位
VOL_RE = re.compile(r"^第([一二三四五六])部")
CHAP_RE = re.compile(r"^第(\d+)章[  \u3000]*(.*)$")
locs, vol, chapno, chap = [], "序", "0", ""
for ln in lines:
    m = VOL_RE.match(ln)
    if m:
        vol, chapno, chap = m.group(1), "0", ""
    else:
        m = CHAP_RE.match(ln)
        if m:
            chapno, chap = m.group(1), m.group(2).strip()
    locs.append((vol, chapno, chap))
VOLNAME = {"一": "第一部 中原西南", "二": "第二部 中南", "三": "第三部 东北",
           "四": "第四部 华北", "五": "第五部 西北", "六": "第六部 华东", "序": "书前"}


def loc_str(i):
    v, c, t = locs[i]
    return VOLNAME.get(v, v) + ("" if c == "0" else " 第%s章" % c)


# ------------------------------------------------------------------ 词典先验
import jieba
import jieba.posseg as pseg
jieba.setLogLevel(60)
DICT_PATH = os.path.join(os.path.dirname(jieba.__file__), "dict.txt")
DICT_NR, DICT_GEO, DICT_ORG, DICT_WORD, DICT_FREQ = set(), set(), set(), set(), {}
for ln in io.open(DICT_PATH, encoding="utf-8"):
    p = ln.split()
    if len(p) < 3:
        continue
    w, fr, tg = p[0], int(p[1]), p[2]
    if not re.match(r"^[一-鿿·]{2,8}$", w):
        continue
    if tg.startswith("nr"):
        DICT_NR.add(w)
    elif tg in ("ns", "nsf"):
        DICT_GEO.add(w)
    elif tg in ("nt", "nz"):
        DICT_ORG.add(w)
    elif tg in ("n", "v", "vd", "vn", "a", "ad", "an", "d", "r", "p", "c", "u", "f", "s", "l",
                "j", "t", "m", "q", "i", "eng", "un", "x"):
        DICT_WORD.add(w)
    DICT_FREQ[w] = max(DICT_FREQ.get(w, 0), fr)
COMMON = {w for w in (DICT_GEO | DICT_ORG | DICT_WORD) if DICT_FREQ.get(w, 0) >= 2500}
COMMON |= set("""我军 敌军 友军 国军 蒋军 伪军 苏军 美军 日军 盟军 义军 联军 援军 孤军 主力 兵团 纵队 军区 司令部
政治部 参谋部 后勤部 电讯 电报 电令 来电 复电 回忆 记录 任务 命令 指示 决议 声明 通告 通知 通报 简报 大部 小部
余人 万人 千人 百元 有的 有人 是故 因此 但是 不要 需要 可以 必须 已经 认为 觉得 知道 听说 表示 表示 晋察冀 晋冀鲁
西北野战 中原野战 华东野战 东北野战 华北野战 华中野战 东北军区 华北军区 华东军区 中央军委 中共中央 国民政府
南京政府 重庆政府 和平谈判 政治协商 整编师 保安团 保安司令 绥靖公署 大道 康庄 白昼 黑夜 星星 火种
""".split())
DICT_ANY_WORD = DICT_GEO | DICT_ORG | DICT_WORD
DICT_BLOCK = DICT_GEO | DICT_ORG | {w for w in DICT_WORD if DICT_FREQ.get(w, 0) >= 400}

# 姓氏：从词典 nr 词条反推（以该字起头的词多大比例是人名）
_nr, _all = defaultdict(int), defaultdict(int)
for ln in io.open(DICT_PATH, encoding="utf-8"):
    p = ln.split()
    if len(p) < 3 or not re.match(r"^[一-鿿]{2,6}$", p[0]):
        continue
    _all[p[0][0]] += 1
    if p[2].startswith("nr"):
        _nr[p[0][0]] += 1
SUR1 = {c for c in _nr if _nr[c] >= 12 and _nr[c] / float(_all[c]) >= 0.42}
GOLD_SUR = set('王 李 张 刘 陈 杨 黄 赵 吴 周 徐 孙 马 朱 胡 郭 何 林 罗 高 郑 梁 谢 宋 唐 许 韩 冯 邓 曹 彭 曾 肖 萧 田 董 袁 潘 于 蒋 蔡 余 杜 叶 程 苏 魏 薛 吕 丁 任 沈 姚 卢 傅 钟 姜 崔 谭 陆 汪 范 金 石 廖 贾 夏 韦 付 方 白 邹 孟 熊 秦 邱 江 尹 段 雷 侯 龙 史 陶 黎 贺 顾 毛 郝 龚 邵 万 钱 严 覃 武 戴 孔 康 施 齐 伍 尤 查 向 牛 寿 相 屠 容 邦 苑 凌 浦 苗 祝 阮 蓝 闵 席 季 麻 强 骆 卞 项 郁 单 杭 洪 包 诸 左 吉 嵇 邢 滑 裴 荣 翁 荀 羊 於 惠 甄 封 瞿 嵩 祁 满 延 平 富 巫 乌 焦 巴 弓 牧 隗 谷 车 宓 蓬 班 仰 秋 仲 伊 宫 宁 仇 栾 暴 甘 钭 厉 戎 祖 符 景 詹 束 幸 司 韶 郜 蓟 薄 印 宿 怀 蒲 邰 鄂 防 芷 元 穆 和 闫 解 归 海 山 善 撒 聂 晁 娄 匡 窦 关 鄢 昆 郦 甯 萨 那 区 冈 冼 阚 缑 翦 逄 杲 雒 驺 黎 涂 Krish 颖 慎 振 捕 钦 鄢 卫 蒋 沈 韩 杨 朱 秦 许 吕 施 张 孔 曹 曾 韦 华 巧 形 计 求 拱 要 在 正 此 会 有 为 是 时 当 得 就 这 那 里 每 或 能 从 至 及 并 也 又 已 尚 需 须 非 常 平 均 各 别 特 分 先 后 内 外 中 小 大 上 下 左右 前 本 末 总 结 合 同 意 见 闻 问 间 面 部门 长 期 短 暂 缓慢 快 与 也')
GOLD_SUR = {c for c in GOLD_SUR if '一' <= c <= '鿿' and c not in set('Khirs上下中为也从会先分别前又及右各合同后在均外大小尚就左巧已常平并当形得快总意慎或拱振捕时是暂有期末正此每求特短缓联能至要见计那部里钦长门问闻非面须颖')}
SUR1 |= GOLD_SUR | set("皮区冈冼阚缑翦逄岑劳权巫台吉亦吕牟那满宿党钢铁石")

SUR_COMPOUND = ["欧阳", "上官", "司马", "东方", "独孤", "南宫", "万俟", "闻人", "夏侯", "诸葛", "尉迟", "赫连",
                "澹台", "皇甫", "濮阳", "公冶", "太叔", "申屠", "公孙", "慕容", "钟离", "长孙", "宇文", "司徒",
                "鲜于", "司空", "司寇", "巫马", "拓跋", "百里", "东郭", "左丘", "西门", "第五", "呼延", "完颜",
                "纳兰", "令狐", "轩辕", "爱新觉罗", "钮祜禄", "乞伏", "秃发", "阿史那", "失吉", "子车", "公西"]
SUR_RE = re.compile("(?:" + "|".join(sorted(set(SUR_COMPOUND), key=len, reverse=True)) + r"|["
                    + "".join(sorted(SUR1)) + r"])")
# 只用作“合称”判定：真正的大姓
TOP_SUR = set("王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏"
              "魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛段雷侯龙史陶黎贺顾毛郝龚邵万"
              "钱严武戴孔康施齐戚萧岳")

GEO_SUFFIX = "省市区县乡村屯堡寨坪沟湾岭坡岸渡桥关隘口山河江湖海泉州府道旗梁堆塘畈垸岙峒甸庵庙铺集营庄砦堰坝坊巷滨涯垴岗峰峦"
GEO_MORPH = re.compile(r"[%s]{1,5}[%s]$" % (CJ, GEO_SUFFIX))
PLACE_END = re.compile(r"[%s]{1,5}(战场|地区|一带|附近|省内|境内|郊外|车站|渡口|桥头|山口|要点|阵地|防线|县城|市郊|河岸|江畔|河边)$" % CJ)
GEO_LEAD = (r"在|到|向|抵达|进驻|攻占|攻克|占领|解放|进占|撤至|退至|越过|渡过|突破|直逼|逼近|会师|奇袭|袭占|"
            r"进逼|转进|开赴|奔赴|到达|攻入|光复|收复|围困|攻打|进击|袭击|深入|窜至|逃往|退守|驻|宿营于|活动于|转战")
GEO_LEAD_RE = re.compile(r"(?:%s)[\u3000 ]*([%s]{2,6})(?![%s])" % (GEO_LEAD, CJ, CJ))
GEO_TAIL_RE = re.compile(r"(?<![一-鿿])([%s]{2,6})(?:以北|以南|以东|以西|一带|地区|境内|附近|郊外|城下|城外|城内|车站|一线|河畔|桥头|山口|要点|阵地)" % CJ)

# ------------------------------------------------------------------ 证据模式
RANK = (r"总司令|副总司令|司令员|副司令员|代司令员|司令|副司令|政治委员|副政治委员|政委|副政委|参谋长|副参谋长|"
        r"政治部主任|政治部副主任|主任|副主任|司令长官|副司令长官|总指挥|副总指挥|前敌总指挥|兵团司令|兵团副司令|"
        r"兵团政委|军区司令|军区政委|纵队司令|纵队政委|纵队副司令|军长|副军长|军政委|师长|副师长|师政委|旅长|副旅长|"
        r"团长|副团长|支队长|大队长|区队长|教导员|指导员|队长|副队长|书记|副书记|常委|委员|中央委员|政治局委员|部长|"
        r"副部长|厅长|局长|处长|科长|秘书|主席|副主席|总理|副总理|外长|大使|公使|特使|代办|武官|校长|副校长|司令官|"
        r"长官|将军|元帅|上将|中将|少将|大将|准将|代表|顾问|参谋|同志|先生|夫人|太太|小姐|教授|记者|翻译|译员|医生|"
        r"县长|市长|省长|董事长|总经理|国务卿|总统|副总统|首相|议长|院长|检察长|署长|总监|督办公署主任|行营主任|"
        r"行辕主任|警备司令|卫戍司令|保安司令|绥靖公署主任|总裁|议会议长|牧师|神父|主教|阿訇|方丈|住持|大夫|"
        r"主编|社长|台长|主笔|发行人|参议员|国大代表|委员长|统帅|督军|镇守使|土司|王爷|可汗|头人|提督|总兵")
ACT = (r"围歼|歼灭|俘虏|活捉|击毙|打死|击伤|逮捕|释放|处决|枪毙|判处|扣押|召见|接见|会见|宴请|约见|拜访|送别|"
       r"命令|指令|委派|任命|派遣|调任|通知|嘱咐|叮嘱|交代|请示|报告|转告|告知|交给|送给|委托|授权|责成|要求|"
       r"批评|表扬|称赞|质问|询问|召请|电令|致电|电告|复电|接洽|商谈|会谈|陪同|率领|指挥|接替|接替|接替")
L_BOUND = r"(?<![一-鿿])"
R_BOUND = r"(?![一-鿿])"

# 职务在前：允许名字后接动词（否则“师长王理寰电话请示”会整个漏掉）
RANK_AFTER = re.compile(r"(?:%s)[\u3000 ]*([%s]{2,4})(?![%s])" % (RANK, CJ, CJ))
RANK_AFTER_TIGHT = re.compile(r"(?:%s)[\u3000 ]*([%s]{2,4})%s" % (RANK, CJ, R_BOUND))
RANK_BEFORE = re.compile(r"%s([%s]{2,4})(?:%s)%s" % (L_BOUND, CJ, RANK, R_BOUND))
ACT_NAME = re.compile(r"(?:%s)[\u3000 ]*(?:其|敌|该)?([%s]{2,4})(?=(?:部队|兵团|纵队|集团|所部)|%s|$)"
                      % (ACT, CJ, R_BOUND))
BIO_RE = re.compile(r"%s([%s]{2,4})，[^，。；]{0,18}?(?:省|市|县|区|旗|村|屯|镇)[^，。；]{0,14}人[，、]" % (L_BOUND, CJ))
BIO_YEAR = re.compile(r"%s([%s]{2,4})[，(（]\d{2,4}年(?:生|出世|诞生)" % (L_BOUND, CJ))
BIO_TAG = re.compile(r"%s([%s]{2,4})(?:，|、)[^，。]{0,14}?(?:人[，、]|黄埔|日本陆军|日本士官|留法|留苏|留美|行伍|出身|党员)" % (L_BOUND, CJ))
ALIAS_RE = re.compile(r"%s([%s]{2,4})[，,、](?:原名|字|号|又名|改名|化名)[\u3000 ]*([%s]{2,4})" % (L_BOUND, CJ, CJ))
VERB = (r"说|指出|强调|认为|表示|指示|命令|下令|致电|电告|复电|回电|发电|报告|汇报|提出|决定|同意|反对|要求|建议|"
        r"就任|出任|调任|转任|兼任|代理|率|率领|指挥|布置|部署|起草|到达|来到|抵达|飞抵|离开|起义|投诚|被俘|阵亡|"
        r"牺牲|逝世|去世|参加|主持|出席|访问|会见|接见|陪同|谈判|签署|发表|讲话|发言|请求|拒绝|答复|回答|询问|获悉|"
        r"承认|否认|批准|否决|撤销|恢复|担任|获释|释放|处决|枪毙|击毙|打死|俘虏|活捉|逮捕|判|授衔|脱险|逃走|潜逃|"
        r"叛变|投敌|自首|供出|签字|签订|发电报|回信|来信|接洽|商谈|会谈|拜会|拜访|送行|迎接|启程|动身|回忆|讲|谈")
VERB_RE = re.compile(r"%s([%s]{2,4}?)(?:又|曾|也|都|就|便|随即|立即|马上|亲自|先后|再次|一直|一再|多次|连连|欣然)?(?:%s)%s"
                     % (L_BOUND, CJ, VERB, R_BOUND))
PART_RE = re.compile(r"%s([%s]{2,4}?)(?:部队|兵团|纵队|集团|所部|旅|团|师|军|部)(?:[，。、；：！？  \u3000]|$)" % (CJ, CJ))
TEL_RE = re.compile(r"(?:致电|电告|告|命|令|请|委|派|由|任|调|率|同|与|和|向|约|偕|给|嘱咐|通知)[\u3000]{0,1}([%s]{2,4})%s" % (CJ, R_BOUND))
ETC_RE = re.compile(r"%s([%s]{2,4})等(?=[人级同志将校于部位\d])" % (L_BOUND, CJ))
QUOTE_SAY = re.compile(r"""[”"]([%s]{2,4})(?=说|问|答|道|讲|表示|指出)""" % CJ)
QUOTE_BEFORE = re.compile(r"%s([%s]{2,4})[，,][\u3000 ]*[“\"]" % (L_BOUND, CJ))
ENUM_STRICT = re.compile(r"%s([%s]{2,4}(?:、[%s]{2,4}){1,9})%s" % (L_BOUND, CJ, CJ, R_BOUND))
ENUM_LOOSE = re.compile(r"([%s]{2,4}(?:、[%s]{2,4}){1,9})" % (CJ, CJ))
FOREIGN = re.compile(r"(?<![一-鿿·])([%s]{2,6}(?:·[%s]{1,6}){1,5})(?![一-鿿·])" % (CJ, CJ))
PAREN_APP = re.compile(r"%s([%s]{2,4})[（(][^）)]{2,26}[）)]" % (L_BOUND, CJ))

ev = defaultdict(Counter)
where = defaultdict(set)
titles = defaultdict(Counter)
geo_hit = Counter()
alias = defaultdict(set)


def add(w, i, kind):
    w = w.strip("· ")
    if not (2 <= len(w) <= 8):
        return
    ev[w][kind] += 1
    where[w].add(i)


def name_variants(span):
    """职务后窗口里可能混进动词首字，给出 2..len 的前缀候选（如 王理寰 / 王理寰电 -> 王理寰）。"""
    out = {span}
    for cut in (1, 2):
        if len(span) - cut >= 2:
            out.add(span[:-cut])
    return out


for i, ln in enumerate(lines):
    for m in GEO_LEAD_RE.finditer(ln):
        geo_hit[m.group(1)] += 1
    for m in GEO_TAIL_RE.finditer(ln):
        geo_hit[m.group(1)] += 1

for i, ln in enumerate(lines):
    if len(ln.strip()) < 3:
        continue
    for m in RANK_AFTER.finditer(ln):
        for v in name_variants(m.group(1)):
            add(v, i, "rank" if v == m.group(1) else "rankP")
    for m in RANK_AFTER_TIGHT.finditer(ln):
        add(m.group(1), i, "rankT")
        t = ln[max(0, m.start() - 12):m.start(1)].strip(" ，。、")
        if t:
            titles[m.group(1)][t] += 1
    for m in RANK_BEFORE.finditer(ln):
        add(m.group(1), i, "rankB")
        titles[m.group(1)][ln[m.end(1):m.end()]] += 1
    for m in ACT_NAME.finditer(ln):
        add(m.group(1), i, "act")
    for rx, k in ((BIO_RE, "bio"), (BIO_YEAR, "bio"), (BIO_TAG, "bio2"), (VERB_RE, "verb"),
                  (PART_RE, "part"), (ETC_RE, "etc"), (QUOTE_SAY, "quote"), (QUOTE_BEFORE, "qb"),
                  (TEL_RE, "tel"), (PAREN_APP, "paren")):
        for m in rx.finditer(ln):
            add(m.group(1), i, k)
    for m in ALIAS_RE.finditer(ln):
        add(m.group(1), i, "bio")
        add(m.group(2), i, "alias")
        alias[m.group(1)].add(m.group(2))
        alias[m.group(2)].add(m.group(1))
    for m in FOREIGN.finditer(ln):
        add(m.group(0), i, "foreign")
    for w, f in pseg.cut(ln):
        if f.startswith("nr"):
            add(w, i, "jieba")
    if i % 12000 == 0:
        print("  证据 %d/38734 %.0fs cands=%d" % (i, time.time() - t0, len(ev)), file=sys.stderr)

# ------------------------------------------------------------------ 计数（前缀树）
def count_mentions(cands):
    trie = {}
    for w in cands:
        node = trie.setdefault(w[0], {})
        for ch in w[1:]:
            node = node.setdefault(ch, {})
        node["$"] = w
    maxlen = max((len(w) for w in cands), default=3)
    men, cr, cl, mlines = Counter(), Counter(), Counter(), defaultdict(set)
    CJSET = set(chr(c) for c in range(0x4E00, 0x9FFF + 1))
    for li, ln in enumerate(lines):
        for run in re.finditer(r"[%s·]+" % CJ, ln):
            s = run.group(0)
            i = 0
            while i < len(s):
                node = trie.get(s[i])
                if node is None:
                    i += 1
                    continue
                best = node.get("$")
                j = i + 1
                while j < len(s) and j - i < maxlen:
                    node = node.get(s[j])
                    if node is None:
                        break
                    if "$" in node:
                        best = node["$"]
                    j += 1
                if best:
                    men[best] += 1
                    mlines[best].add(li)
                    nxt = s[j] if j < len(s) else ""
                    pv = (ln[run.start() + i - 1] if run.start() + i > 0 else "")
                    if nxt not in CJSET:
                        cr[best] += 1
                    if pv not in CJSET:
                        cl[best] += 1
                    i += len(best)
                else:
                    i += 1
    return men, cr, cl, mlines


men, clean_r, clean_l, men_lines = count_mentions(set(ev))
print("计数完成 %.0fs，候选 %d" % (time.time() - t0, len(ev)), file=sys.stderr)

# 干净人名的“同句还有别的确证人名”比例，用来把只靠词性标注的存疑候选拉回主表


def is_compound(w):
    if not (2 <= len(w) <= 4) or "·" in w or w in DICT_NR:
        return False
    return all(ch in TOP_SUR for ch in w)


# ---------------------------------------------------------------- 自举：顿号名单
SEED = {w for w, c in ev.items()
        if c["bio"] or c["foreign"] or c["rankT"] >= 2 or c["rank"] + c["rankB"] >= 4
        or (c["verb"] >= 2 and c["jieba"] >= 3) or c["quote"] >= 1}
print("seed0=%d" % len(SEED), file=sys.stderr)
for rnd in range(3):
    gain = 0
    for i, ln in enumerate(lines):
        for m in ENUM_LOOSE.finditer(ln):
            parts = m.group(1).split("、")
            known = [p for p in parts if p in SEED]
            if not known:
                continue
            for p in parts:
                if p in known or p in COMMON or is_compound(p) or GEO_MORPH.match(p):
                    continue
                if not (SUR_RE.match(p) or p in DICT_NR):
                    continue
                ev[p]["enum"] += len(known)
                where[p].add(i)
                if p not in SEED:
                    SEED.add(p)
                    gain += 1
    print("  顿号自举 round%d +%d (seed=%d)" % (rnd, gain, len(SEED)), file=sys.stderr)
    if not gain:
        break
# 全生人顿号链：整条链都形似人名且无地名证据 -> 互相印证
for i, ln in enumerate(lines):
    for m in ENUM_STRICT.finditer(ln):
        ps = m.group(1).split("、")
        if len(ps) < 3 or any((not (SUR_RE.match(p) or p in DICT_NR)) or p in COMMON or is_compound(p)
                              or GEO_MORPH.match(p) or geo_hit.get(p, 0) for p in ps):
            continue
        for p in ps:
            ev[p]["chain"] += 1
            where[p].add(i)

# 重新计数（自举会带来新候选）
extra = {w for w in ev if w not in men}
if extra:
    m2, c2, cl2, l2 = count_mentions(extra)
    men.update(m2)
    clean_r.update(c2)
    clean_l.update(cl2)
    for k, v in l2.items():
        men_lines[k] |= v
print("自举+补计数完成 %.0fs" % (time.time() - t0), file=sys.stderr)

HAND_KEEP = set(['周恩来', '郑洞国', '薛岳', '余汉谋', '高岗', '万毅', '李兆麟', '杜鲁门', '斯大林', '王仲廉', '冯玉祥', '卢浚泉', '解方', '甘泗淇', '李默庵', '孙良诚', '阙汉骞', '舒同', '罗列', '孙震', '区寿年', '宋瑞珂', '王凌云', '王理寰', '陈康', '邓发', '陈光', '邱创成', '冯仲云', '庞炳勋', '李克农', '向凤武', '陈纳德', '马海德', '王德', '丘吉尔', '李任仁', '卢汉', '萧华', '邓华', '郭景云', '关麟征', '沈钧儒', '姬鹏飞', '吉洛', '赛福鼎', '乌兰夫', '王泽浚', '刘嘉树', '陈金玉', '赵守钰', '塔德', '蒋经国', '蒋纬国', '宋子文', '孔祥熙', '陈立夫', '吴鼎昌', '王云五', '张发奎', '李汉魂', '谷正鼎', '唐式遵', '喻英奇', '曾扩情', '王陵基', '今村', '冈村宁次', '阿沛', '崔可夫', '罗申', '斯特朗', '史沫特莱', '白求恩', '马歇尔', '赫尔利', '魏德迈', '司徒雷登', '何基沣', '张克侠', '廖运周', '曾泽生', '潘朔端', '吴化文', '赵寿山', '马鸿宾', '马继援', '郝鹏举', '孙殿英', '罗奇', '陈铁', '唐云山', '林伟俦', '黄祖勋', '王敬久', '石觉', '赵子立', '吴铁城', '王世杰', '莫德惠', '孙科', '居正', '戴季陶', '于右任', '张群', '程思远', '龙云', '刘文辉', '邓锡侯', '潘文华', '王缵绪', '杨森', '宋希濂', '胡琏', '黄杰', '李延年', '欧震', '孙连仲', '顾锡九', '康泽', '郑介民', '徐远举', '毛人凤', '沈醉', '陈明仁', '程潜', '张笃伦', '傅作义', '卫立煌', '杜聿明', '白崇禧', '李宗仁', '何应钦', '陈诚', '顾祝同', '刘峙', '王耀武', '邱清泉', '黄百韬', '李弥', '黄维', '孙元良', '宋希濂', '范汉杰', '廖耀湘', '郑洞国', '王凌云', '张淦', '张轸', '鲁道源', '唐秉琳', '段苏度', '吉洛', '栗在山', '孔从洲', '何正', '崔文仲', '朱光', '黄鹄显', '王全国', '刘春', '更待'])
HAND_DENY = set(['和第', '日下午', '英勇', '光荣', '电报中', '邓宝', '晋绥野战', '百万', '千万', '西进', '北上', '南下', '东进', '前进', '后退', '包围', '突破', '追击', '阻击', '强攻', '猛攻', '夜袭', '伏击', '袭击', '攻击', '进攻', '退却', '撤退', '转移', '集结', '分散', '突围', '攻克', '攻占', '收复', '失守', '投降', '投诚', '整编', '补充', '升级', '参军', '支前', '归建', '到任', '离职', '免职', '撤职', '记过', '记功', '颁奖', '讲评', '检讨', '考察', '调查', '勘探', '巡视', '视察', '回忆录', '文件', '战士回', '民兵们知', '陈赓说着', '方方的指', '长勋鉴', '部指挥', '官第', '黄敬为', '敌人', '我军', '敌军', '国军', '蒋军', '伪军', '苏军', '美军', '日军'])
HAND_KEEP = {w for w in HAND_KEEP if 2 <= len(w) <= 6}
HAND_DENY |= set(['大家都', '都被', '三人', '两人', '你们', '我们', '他们', '新战士', '天亮', '承德', '鲁中', '指挥下', '华北第', '向毛泽东', '萧克关于', '团研究', '们说', '公里处', '傅先生', '粟裕命令', '小敌', '高陵', '阳高', '国民党兵', '曾军长', '桂林', '带领下', '年纪老了', '何情况下', '山东和华', '马歇尔一', '曾生回忆', '电称一节', '还有的人', '力已达', '都到齐', '德惠之敌', '冀鲁豫', '晋察冀', '聂荣臻的', '主力向西', '于攻坚', '邓纵', '解参谋长', '陆军总', '高兴地', '王明', '某部', '该部', '敌部', '我部', '首长的', '司令员的', '军长的', '师长的', '团长', '营长', '连长'])
HAND_DENY |= set("王某 唐某 解决后 等职 陈再 周士 凤翔 关庄 吴庄 陶述 江防线 司令员兼 贺习 朱总司令 荣臻 都到齐 还有的人 电称一节 力已达 德惠之敌 国民党兵 主力向西 于攻坚 小敌 带领下 年纪老了 何情况下 山东和华 马歇尔一 高处 平原 城市 乡村".split())
HAND_DENY = {w for w in HAND_DENY if 2 <= len(w) <= 6}

# ---- 自动 mined 的地名：出现在“X以北/一带/地区/车站”等结构里的串
PLACE_MINED = Counter()
for i, ln in enumerate(lines):
    for m in re.finditer(r"([%s]{2,6})(?:以北|以南|以东|以西|一带|地区|车站|城郊|市内|县境内|渡口|桥头)" % CJ, ln):
        PLACE_MINED[m.group(1)] += 1
PLACE_MINED = {w for w, n in PLACE_MINED.items() if n >= 2}
BAD_START = set("的来了又也与被第与之其或而但却乃是不未很更最她那这他她它该某各每员部会师召长官民士战首敌我"
                "您咱另千万百万余所由已尚就只才能可没有无非是否以外以内前后左右边面处种样件条名位次回遍和日")
BAD_START = BAD_START | set("着")
RANK_WORDS = set(re.split(r"\|", RANK)) | {"司令员", "政治委员", "参谋长", "军长", "师长", "旅长", "团长"}
BAD_END = set("的们军师旅团委部局队省市区县任")
BAD_TAIL2 = set(["报告","汇报","回答","说道","笑道","问道","吼道","骂道","命令","指示","指出","强调","指出","说","道","问"])
print("mined地名=%d 职衔词=%d" % (len(PLACE_MINED), len(RANK_WORDS)), file=sys.stderr)

# ---------------------------------------------------------------- 分层
STRUCT = ("rank", "rankT", "rankB", "bio", "bio2", "verb", "part", "quote", "qb", "etc", "enum",
          "foreign", "alias", "act", "chain")


def struct_cnt(c):
    return (c["rank"] + c["rankT"] * 3 + c["rankB"] * 2 + c["bio"] * 6 + c["bio2"] * 3 + c["verb"] * 2
            + c["part"] * 2 + c["act"] * 2 + c["quote"] * 3 + c["qb"] * 2 + c["etc"] + c["enum"]
            + c["chain"] * 2 + c["foreign"] * 3 + c["alias"] * 3 + min(c["tel"], 6) + c["rankP"] * 0)


def n_struct(c):
    return sum(1 for k in STRUCT if c[k])


def form_ok(w):
    if "·" in w:
        return bool(re.match(r"^[一-鿿·]{2,10}$", w))
    if not re.match(r"^[一-鿿]{2,5}$", w):
        return False
    if w in COMMON:
        return False
    if SUR_RE.match(w) or w in DICT_NR:
        return True
    return False


A, B, C1, C2 = {}, {}, {}, {}
for w, c in ev.items():
    ls = sorted(where[w])
    if not ls:
        continue
    g = geo_hit.get(w, 0)
    s = struct_cnt(c)
    ns = n_struct(c)
    m = men.get(w, 0)
    e = {"ev": {k: v for k, v in c.items() if v}, "s": s, "ns": ns, "geo": g, "mentions": m,
         "wordy": bool(w in DICT_GEO or w in DICT_ORG or w in PLACE_MINED or w in RANK_WORDS
                       or w in COMMON or w[-1] in BAD_END
                       or (w in DICT_WORD and w not in DICT_NR)),
         "clean": clean_r.get(w, 0), "nctx": len(ls), "lines": ls[:600],
         "titles": [t for t, _ in titles[w].most_common(3)], "first": loc_str(ls[0]),
         "compound": is_compound(w)}
    if "·" in w:
        (A if (c["foreign"] or c["jieba"] or m >= 2) else C2)[w] = e
        continue
    if (w in COMMON and w not in HAND_KEEP) or (g >= 3 and g * 2 > s + m and w not in HAND_KEEP):
        C2[w] = e
        continue
    if e["compound"] and not (c["bio"] or c["rankT"] or c["quote"] or c["alias"] or c["enum"] >= 2
                              or c["verb"] or w in HAND_KEEP):
        C2[w] = e
        continue
    if w in os.environ.get("NAME_DEBUG", "").split():
        print("  TRACE %s geo=%s compound=%s ns=%d inCOMMON=%s men=%d strong=%s wordy=%s form_ok=%s need=%s tel=%s jieba=%s"
              % (w, g, e["compound"], ns, w in COMMON, m,
                 bool(c["bio"] or c["quote"] or c["foreign"] or c["alias"] or c["rankT"] >= 2 or c["rankB"] >= 2
                      or c["rank"] >= 3 or (c["verb"] >= 2 and (c["jieba"] >= 3 or m >= 3)) or ns >= 3),
                 (w in DICT_GEO or w in DICT_ORG or w in PLACE_MINED or w in RANK_WORDS or w in COMMON
                  or w[-1] in BAD_END or (w in DICT_WORD and w not in DICT_NR)),
                 form_ok(w), w in DICT_BLOCK, c["tel"], c["jieba"]), file=sys.stderr)
    strong = (c["bio"] or c["quote"] or c["foreign"] or c["alias"] or c["rankT"] >= 2 or c["rankB"] >= 2
              or c["rank"] >= 3 or (c["verb"] >= 2 and (c["jieba"] >= 3 or m >= 3)) or ns >= 3)
    wordy = (w in DICT_GEO or w in DICT_ORG or w in PLACE_MINED or w in RANK_WORDS
             or w in COMMON or w[-1] in BAD_END
             or (w in DICT_WORD and w not in DICT_NR))
    if w in HAND_KEEP:
        wordy = False
    if w in HAND_DENY:
        C2[w] = e
        continue
    hard = bool(c["bio"] or c["quote"] or c["foreign"] or c["alias"] or c["rankT"] >= 3)
    if strong and not wordy and (form_ok(w) or hard):
        A[w] = e
        continue
    if strong and wordy and w not in DICT_GEO and w not in DICT_ORG and w not in PLACE_MINED \
            and (c["bio"] or c["rankT"] >= 2 or c["quote"] or c["alias"]):
        A[w] = e            # 词典里是普通词、但同时有传记式/称号式硬证据（如“傅作义”若被词典误标）
        continue
    need = 1 if (w in DICT_BLOCK and w not in DICT_NR) else 0
    if form_ok(w) and not wordy and (ns >= 1 + need or c["tel"] >= 2 or w in HAND_KEEP) \
            and (s + c["jieba"] >= 3 or m >= 6 or w in HAND_KEEP):
        B[w] = e
        continue
    # 存疑：词性标注单独命中、或提及次数不少但缺人物语境
    if c["jieba"] >= 2 and m >= 2 and not (GEO_MORPH.match(w) or PLACE_END.match(w)):
        C1[w] = e
    else:
        C2[w] = e
AB_all = {}
for _t in (A, B):
    for _k, _v in _t.items():
        _v["tier"] = "A" if _t is A else "B"
        AB_all[_k] = _v

# ---- 同句共现提升（只靠词性标注、但反复出现且总与确证人名同句的，多半是人名）
CONF_A = {k for k, v in A.items() if v["mentions"] >= 3}
line_has_a = set()
for w in CONF_A:
    for i in men_lines.get(w, ()):
        line_has_a.add(i)
co_a = Counter()
for w, e in list(C1.items()):
    n = sum(1 for i in men_lines.get(w, ()) if i in line_has_a)
    e["co_a"] = n
    if (e["mentions"] >= 8 and n >= 3 and clean_r.get(w, 0) >= 3 and clean_l.get(w, 0) >= 3
            and clean_l.get(w, 0) * 2 >= e["mentions"] and form_ok(w)
            and w not in COMMON and w not in DICT_ANY_WORD and w not in DICT_BLOCK
            and w not in RANK_WORDS and w not in PLACE_MINED and w[-1] not in BAD_END
            and not GEO_MORPH.match(w) and not PLACE_END.match(w)):
        e["tier"] = "B"
        e["promoted"] = 1
        AB_all[w] = e
        C1.pop(w, None)
print("共现提升 %d" % len([1 for v in AB_all.values() if v.get("promoted")]), file=sys.stderr)
print("分层 A=%d B=%d C1=%d C2=%d" % (len(A), len(B), len(C1), len(C2)), file=sys.stderr)
_DBG = os.environ.get("NAME_DEBUG", "").split()
for _w in _DBG:
    _c = ev.get(_w, Counter())
    print("DBG %s tier=%s ev=%s mentions=%d geo=%d wordy=%s inDICT_NR=%s inDICT_WORD=%s inCOMMON=%s "
          "inRANK_WORDS=%s inPLACE_MINED=%s badstart=%s badend=%s cleanL=%d clean=%d"
          % (_w, ("A" if _w in A else "B" if _w in B else "C1" if _w in C1 else "C2" if _w in C2 else "-"),
             dict(_c), men.get(_w, 0), geo_hit.get(_w, 0),
             (_w in DICT_GEO or _w in DICT_ORG or _w in PLACE_MINED or _w in RANK_WORDS or _w in COMMON
              or _w[-1] in BAD_END or (_w in DICT_WORD and _w not in DICT_NR)),
             _w in DICT_NR, _w in DICT_WORD, _w in COMMON, _w in RANK_WORDS, _w in PLACE_MINED,
             bool(_w) and _w[0] in BAD_START, _w[-1] in BAD_END, clean_l.get(_w, 0), clean_r.get(_w, 0)),
          file=sys.stderr)

# ---------------------------------------------------------------- 清洗
TAIL_END = set("的了着在于到向为以与及也都就又再更最此那这之不没未是派调去来给被把让由相已还得地时起先生右左"
               "处些该而但却乃亦其所或且即则第副局很挺倍点样般似们应答说问告电令命部立即主会作多研究负责谈采取胜败等任回知著被叫派让" "报送给往称道曰为是着在把让使当")
for ch in "中主多作和名手会应立得地先生胜取":  # 这些字常用作名字末字，别当尾巴
    TAIL_END.discard(ch)
AB = dict(AB_all)
# ---- 保护集：提及多 / 硬证据多 / 人工白名单的条目，不再被后面的启发式规则动刀
PROTECT = {k for k, v in AB.items()
           if v["mentions"] >= 8 or v.get("promoted") or k in HAND_KEEP
           or v["tier"] == "A" or sum(1 for x in ("bio", "rankT", "rankB", "quote", "alias", "foreign")
                                      if v["ev"].get(x)) >= 2}
print("保护集 %d" % len(PROTECT), file=sys.stderr)


dropped, recovered = [], []
for w in sorted(list(AB), key=lambda x: -AB[x]["s"]):
    e = AB[w]
    if "·" in w:
        continue
    tail = ""
    for cut in (1, 2, 3):
        if len(w) - cut < 2:
            break
        if all(ch in TAIL_END for ch in w[len(w) - cut:]):
            tail = w[len(w) - cut:]
            break
    if not tail:
        continue
    pre = w[:-len(tail)]
    if pre in AB:
        te = AB[pre]
        te["lines"] = sorted(set(te["lines"]) | set(e["lines"]))[:600]
        te["mentions"] = max(te["mentions"], e["mentions"])
        te["s"] = max(te["s"], e["s"])
        if e["tier"] == "A":
            te["tier"] = "A"
        AB.pop(w)
        dropped.append((w, pre))
    elif form_ok(pre) and geo_hit.get(pre, 0) == 0 and pre not in COMMON \
            and not any(k.startswith(pre) and k != pre for k in AB):
        e2 = dict(e)
        e2["recovered"] = w
        AB[pre] = e2
        AB.pop(w)
        recovered.append((w, pre))
for w in [k for k, v in AB.items() if (GEO_MORPH.match(k) or PLACE_END.match(k))
          and v["s"] < 12 and k not in DICT_NR and v["mentions"] < 6]:
    AB.pop(w)
    dropped.append((w, "geo"))
print("清洗：尾巴归并 %d，还原 %d，地名剔除 %d，主表 %d" % (len(dropped), len(recovered), 0, len(AB)),
      file=sys.stderr)


# ---- 截断名去重：如“毛泽/彭德/白崇”只会以长名的一部分出现
trunc = []
_bylen = sorted(AB, key=len, reverse=True)
for w in list(AB):
    for L in _bylen:
        if L != w and L.startswith(w) and AB[L]["mentions"] >= AB[w]["mentions"]:
            if AB[w]["mentions"] <= 1 or clean_r.get(w, 0) == 0:
                trunc.append(w)
            break
for w in [k for k, v in AB.items() if k not in PROTECT and len(k) == 2 and k[1] in TAIL_END
           and k not in DICT_NR and v["s"] < 20]:
    AB.pop(w, None)
    dropped.append((w, "2char-tail"))
for w in trunc:
    AB.pop(w, None)
    if w in os.environ.get("NAME_DEBUG", "").split():
        print("DBG %s 被截断名去重剔除" % w, file=sys.stderr)
print("截断名剔除 %d" % len(trunc), file=sys.stderr)

# ---------------------------------------------------------------- 阵营
CCP = """毛泽东 周恩来 刘少奇 朱德 任弼时 张闻天 陈云 邓小平 高岗 饶漱石 李富春 李先念 彭真 董必武 林伯渠
谢觉哉 徐特立 吴玉章 康生 陈毅 贺龙 徐向前 聂荣臻 叶剑英 罗荣桓 刘伯承 林彪 彭德怀 粟裕 陈赓 徐海东 萧劲光
张云逸 叶挺 项英 曾山 谭震林 邓子恢 张鼎丞 罗瑞卿 杨尚昆 李克农 潘汉年 王若飞 邓颖超 蔡畅 李维汉 陶铸
程子华 萧克 李井泉 宋任穷 陈再道 陈锡联 杨得志 杨成武 杨勇 王震 王宏坤 王建安 谢富治 韦国清 谭政 黄克诚
洪学智 刘亚楼 彭雪枫 张爱萍 叶飞 陶勇 王必成 苏振华 李志民 徐立清 甘泗淇 宋时轮 郑维山 陈士榘 唐亮 秦基伟
王近山 杜义德 周希汉 皮定均 詹才芳 许世友 江渭清 钟期光 姬鹏飞 韩先楚 刘震 陈伯钧 李达 吕正操 万毅 周保中
曾克林 赖传珠 孙毅 杨至成 邓华 李天佑 聂鹤亭 贺晋年 王尚荣 罗贵波 王平 方强 袁也烈 冼恒武 梁灵光 刘其人
王六生 丁秋生 王集成 温玉成 雷绍康 方毅 傅钟 萧华 萧望东 舒同 莫文骅 吴克华 文建武 汪锋 郭鹏 王恩茂 罗元发
饶子琪 刘忠 吴世安 周志坚 聂凤智 刘浩天 廖承志 邓发 潘梓年 胡乔木 吴冷西 陈伯达 安子文 刘长胜 钱之光 刘晓
夏衍 阳早 赵寿山 张宗逊 徐向前 李鼎铭 续范亭 赛福鼎 乌兰夫 吕骥 周扬 丁玲"""
KMT = """蒋介石 李宗仁 白崇禧 何应钦 陈诚 顾祝同 刘峙 杜聿明 王耀武 邱清泉 黄百韬 李弥 黄维 孙元良 胡琏
宋希濂 李默庵 张灵甫 欧震 李玉堂 范汉杰 廖耀湘 郑洞国 卫立煌 罗卓英 关麟征 汤恩伯 王仲廉 李仙洲 周至柔
王叔铭 俞大维 翁文灏 孙科 居正 戴季陶 于右任 张群 吴鼎昌 王云五 朱绍良 余汉谋 张发奎 薛岳 余程万 方先觉
夏楚中 李延年 王凌云 张淦 张轸 鲁道源 徐远举 毛人凤 戴笠 郑介民 唐纵 康泽 胡宗南 李文 罗列 盛文 钟彬
宋瑞珂 王敬久 石觉 阙汉骞 黄杰 刘玉章 郭景云 孙连仲 高树勋 马法五 马鸿逵 马鸿宾 马步芳 马继援 韩德勤
孙良诚 郝鹏举 孙殿英 庞炳勋 阎锡山 王缵绪 王陵基 杨森 孙震 吴铁城 陈立夫 陈果夫 孔祥熙 宋子文 蒋经国
蒋纬国 王泽浚 赵子立 罗奇 陈铁 唐云山 林伟俦 何文鼎 李及兰 黄祖勋 周福成 赵国屏 王理寰 向凤武 黄翔
刘嘉树 卢浚泉 区寿年 李延年第 覃震 孙兰峰 安春山 楚大星 陈金钰 李雪三"""
OTH = """宋庆龄 李济深 何香凝 张澜 黄炎培 沈钧儒 陈铭枢 马叙伦 马寅初 谭平山 邵力子 颜惠庆 章士钊 李书城
柳亚子 茅盾 巴金 曹禺 田汉 梅兰芳 齐白石 徐悲鸿 陶行知 邹韬奋 史良 邓初民 陈嘉庚 司徒美堂 张东荪 罗隆基
章伯钧 彭泽民 陈绍宽 蔡廷锴 蒋光鼐 杨杰 熊克武 龙云 刘文辉 邓锡侯 潘文华 卢汉 傅作义 邓宝珊 陈明仁 程潜
陶峙岳 董其武 何基沣 张克侠 廖运周 曾泽生 潘朔端 吴化文 冯玉祥 张难先 陈此生 陈翰笙 李烛尘 朱学范 赛福鼎"""
FORN = """马歇尔 赫尔利 魏德迈 杜鲁门 艾奇逊 麦克阿瑟 斯大林 丘吉尔 艾德礼 冈村宁次 东条英机 梅津美治郎
阿南惟几 山下奉文 畑俊六 今井武夫 崔可夫 罗申 斯特朗 史沫特莱 白求恩 柯棣华 马海德 陈纳德 司徒雷登
葛量洪 白鲁德 孙致义 马立官 契斯恰科夫 科瓦廖夫 莫洛托夫 伏罗希洛夫 朱可夫 杉山元 植田谦吉 本庄繁
冈部直三郎 小林浅三郎 今村均 佐藤 阿沛 高木 清水 和田 安井 前田 松井 栗林 大西"""
SEED_FA = {}
for blk, f in ((CCP, "中共·解放军"), (KMT, "国民党"), (OTH, "民主人士·地方"), (FORN, "外国人")):
    for w in blk.split():
        if 2 <= len(w) <= 4:
            SEED_FA.setdefault(w, f)
CUES = {
    "中共·解放军": ["解放军", "我军", "我部", "野战军", "纵队", "军区", "政治委员", "政委", "政治部", "同志",
                   "中共中央", "军委", "边区", "解放区", "八路军", "新四军", "地下党", "工委", "游击队",
                   "民主建国军", "晋察冀", "太行", "陕甘宁", "东北民主联军", "入党", "改编为", "土地改革",
                   "农会", "贫雇农", "华北局", "东北局", "华中局", "西北局", "华东局", "中原局", "地委", "县委"],
    "国民党": ["国民党", "国军", "蒋军", "中央军", "整编", "绥靖", "剿总", "保安", "国防部", "总统府", "行政院",
             "长官", "伪军", "还乡团", "军统", "中统", "三青团", "蒋方", "南京政府", "国民政府", "省主席",
             "绥公署", "嫡系", "杂牌", "委员长", "总裁", "国大", "党国", "美械", "蒋记"],
    "外国人": ["美国", "美军", "白宫", "国务院", "驻华", "大使", "苏联", "苏军", "日本", "日军", "关东军",
             "大本营", "天皇", "联合国", "联总", "救济署", "占领军", "盟国", "远东"],
}
CUE_RX = {k: re.compile("|".join(re.escape(x) for x in dict.fromkeys(v) if len(x) > 1)) for k, v in CUES.items()}
fa = {}
for w, e in AB.items():
    sc = Counter()
    for i in e["lines"][:80]:
        ln = lines[i]
        for f, rx in CUE_RX.items():
            if rx.search(ln):
                sc[f] += 1
    if w in SEED_FA:
        sc[SEED_FA[w]] += 40
    e["fa"] = sc.most_common(1)[0][0] if sc and sc.most_common(1)[0][1] >= 2 else ""
    fa[w] = e["fa"]
adj = defaultdict(Counter)
for i, ln in enumerate(lines):
    for m in ENUM_LOOSE.finditer(ln):
        ps = [p for p in m.group(1).split("、") if p in AB]
        for a in ps:
            for b in ps:
                if a != b:
                    adj[a][b] += 1
for _ in range(2):
    upd = {}
    for w, e in AB.items():
        if e["fa"]:
            continue
        v = Counter()
        for nb, n in adj[w].most_common(8):
            if fa.get(nb):
                v[fa[nb]] += n
        if v and v.most_common(1)[0][1] >= 2:
            upd[w] = v.most_common(1)[0][0]
    for w, f in upd.items():
        AB[w]["fa"] = f
        fa[w] = f


# ---- 字形闸门：主表里的名字，用字应当出现在高置信人名中；证据薄弱的切词串会被拦下
HIGH = {k for k, v in AB.items()
        if v["mentions"] >= 6 and not v.get("wordy") and (v["ev"].get("rankT", 0) >= 1 or v["ev"].get("bio", 0)
                                                          or v["ev"].get("quote", 0) or v["ns"] >= 2)
        and v["clean"] >= 1}
HIGH |= set(SEED_FA)
NAME_CHARS = {ch for w in HIGH for ch in w if "一" <= ch <= "鿿"}
print("高置信人名 %d，用字 %d" % (len(HIGH), len(NAME_CHARS)), file=sys.stderr)


def shape_ok(w):
    if "·" in w:
        return True
    return all(ch in NAME_CHARS for ch in w)


# 两字虚词尾巴还原：如“马歇尔回答说”被切成“马歇尔回”
for w in list(AB):
    if "·" in w:
        continue
    e = AB[w]
    if e["s"] >= 12 or e["tier"] != "B" or e["mentions"] >= 6:
        continue
    for cut in (1, 2):
        pre = w[:-cut]
        if len(pre) < 2:
            continue
        tail = w[len(pre):]
        if not (all(ch in TAIL_END for ch in tail) or tail in DICT_ANY_WORD or tail in RANK_WORDS):
            continue
        if form_ok(pre) and shape_ok(pre) and geo_hit.get(pre, 0) == 0 and pre not in COMMON:
            if pre in AB:
                te = AB[pre]
                te["lines"] = sorted(set(te["lines"]) | set(e["lines"]))[:600]
                te["mentions"] = max(te["mentions"], e["mentions"])
                if e["tier"] == "A":
                    te["tier"] = "A"
            else:
                e2 = dict(e)
                e2["recovered"] = w
                AB[pre] = e2
            AB.pop(w, None)
            dropped.append((w, pre))
            break
print("虚词尾巴还原后 %d" % len(AB), file=sys.stderr)


# ---- 最终字形复核：证据薄弱者若用字不在高置信人名用字集内，请出主表
out_of_shape = []
for w in list(AB):
    e = AB[w]
    hard = (e["ev"].get("bio", 0) + e["ev"].get("rankT", 0) + e["ev"].get("quote", 0)
            + e["ev"].get("alias", 0) + e["ev"].get("foreign", 0) + e["ev"].get("rankB", 0))
    if shape_ok(w) or hard >= 2 or w in HAND_KEEP:
        continue
    if w in os.environ.get("NAME_DEBUG", "").split():
        print("DBG 被字形复核剔除：%s hard=%d shape_ok=%s" % (w, hard, shape_ok(w)), file=sys.stderr)
    out_of_shape.append(w)
    C1[w] = dict(e, tier="C1")
    AB.pop(w, None)
print("字形复核请出主表 %d 条" % len(out_of_shape), file=sys.stderr)


# ---------------------------------------------------------------- 终局否决

BAD_START = set("的来了又也与被第与之其或而但却乃是不未很更最她那这他她它该某各每员部会师召长官民士战首敌我"
                "您咱另千万百万余所由已尚就只才能可没有无非是否以外以内前后左右边面处种样件条名位次回遍和日")
FINAL_VETO = set("""地主 军长 参谋 司令 政委 部长 科长 县长 市长 省长 厅长 局长 主任 主席 总理 代表 同志 先生 女士 小姐
太太 夫人 将军 元帅 战士 干部 党员 民兵 民工 群众 百姓 敌人 我军 敌军 国军 蒋军 伪军 苏军 美军 日军 联络 带领 会合 开会
报告 通知 命令 指示 决定 意见 态度 情况 问题 任务 机会 时机 时间 空间 地区 地方 方向 方面 位置 单位 部门 机关 组织 领导
人员 人手 人物 名称 名字 称号 头衔 职务 职位 岗位 官兵 将士 将校 校官 尉官 士兵 兵员 队伍 部队 军队 军团 兵团 纵队 支队
大队 中队 小队 分队 班排 连排 营连 旅团 师旅 军民 后方 前方 前线 阵地 据点 碉堡 封锁 沟线 主力 地方 野战 晋绥野战 华东
""".split())
print("终局否决规则装载：BAD_START %d，FINAL_VETO %d" % (len(BAD_START), len(FINAL_VETO)), file=sys.stderr)


def vetoed(w, e):
    if "·" in w:
        return w.endswith("著") or w.endswith("等") or w[-1] in BAD_START
    if w in HAND_KEEP:
        return False
    hard = sum(1 for k in ("bio", "rankT", "rankB", "quote", "alias", "foreign", "enum") if e.get(k))
    if (w[0] in BAD_START or w[-1] in BAD_END or w in RANK_WORDS or w in FINAL_VETO
            or w in COMMON or w in HAND_DENY):
        return True
    if (w in DICT_GEO or w in DICT_ORG or w in PLACE_MINED) and hard < 2:
        return True
    if w in DICT_WORD and w not in DICT_NR and hard < 2:
        return True
    return False


for w in list(AB):
    if w in os.environ.get("NAME_DEBUG", "").split():
        print("DBG 终局否决判定 %s -> %s" % (w, vetoed(w, AB[w])), file=sys.stderr)
    if vetoed(w, AB[w]):
        C2[w] = dict(AB[w], tier="C2")
        AB.pop(w, None)
# ---- 助词尾巴（不受保护集影响）：罗荣桓和→罗荣桓；解决后/等职→剔除
PARTICLE = set("和与后职等其之也皆俱")
_p2, _p3 = [], []
for w in list(AB):
    if "·" in w or len(w) < 3 or w in HAND_KEEP:
        continue
    if w[-1] not in PARTICLE:
        continue
    pre = w[:-1]
    if pre in AB:
        te = AB[pre]
        te["lines"] = sorted(set(te["lines"]) | set(AB[w]["lines"]))[:600]
        te["mentions"] = max(te["mentions"], AB[w]["mentions"])
        _p2.append(w)
    elif not form_ok(pre):
        _p2.append(w)
for w in set(_p2):
    AB.pop(w, None)
_p3 = [k for k, v in AB.items() if k not in HAND_KEEP and k not in DICT_NR and len(k) >= 3
       and (k[-1] in "兼某" or k[-2:] in RANK_WORDS or k[-2:] in {"防线", "解决", "以后", "以来", "之外", "等职"}
            or k.startswith(("解决", "江防", "该", "此", "其中", "还有")))]
for w in _p3:
    AB.pop(w, None)
print("助词尾巴 %d，职衔收尾 %d，主表 %d" % (len(set(_p2)), len(_p3), len(AB)), file=sys.stderr)

# ---- R3：词典地名/机构名硬否决（只留人工白名单）
for w in [k for k, v in AB.items() if k not in PROTECT and (k in DICT_GEO or k in DICT_ORG)
          and k not in DICT_NR and "·" not in k]:
    AB.pop(w, None)

# ---- R1：与已知名/已认人物粘连出来的串（向傅作义、马歇尔一、李井泉任）
AFFIX = set("向对为以把被给从并及其该此如亦再更且即虽则然因缘由之等和与同或还又只挨照按依照根据关于至于选一")
_known = [k for k in AB if AB[k]["mentions"] >= 5]
_glued = []
for w in list(AB):
    if w in _known or "·" in w or w in PROTECT:
        continue
    for L in _known:
        if L == w or len(L) < 2:
            continue
        if w.endswith(L) and 1 <= len(w) - len(L) <= 2 and all(c in AFFIX or c in TAIL_END for c in w[:-len(L)]):
            _glued.append(w)
            break
        if w.startswith(L) and 1 <= len(w) - len(L) <= 2 and all(c in AFFIX or c in TAIL_END for c in w[len(L):]):
            _glued.append(w)
            break
for w in _glued:
    AB.pop(w, None)

# ---- R2：能切成两个常用词的串（西北方向、年纪老了、何情况下、山东和华）
_bigram = {w for w in (DICT_WORD | DICT_GEO | DICT_ORG) if DICT_FREQ.get(w, 0) >= 800}
_split = []
for w in list(AB):
    if "·" in w or w in PROTECT or w in _bigram or len(w) < 4:
        continue
    for cut in range(2, len(w) - 1):
        if w[:cut] in _bigram and w[cut:] in _bigram:
            _split.append(w)
            break
for w in _split:
    AB.pop(w, None)
print("R1 粘连 %d，R2 双词 %d，主表 %d" % (len(_glued), len(_split), len(AB)), file=sys.stderr)
print("WATCH after R1R2:", [(k, k in AB) for k in ("林彪","朱德","胡宗南","陈赓","邓小平")], file=sys.stderr)

# ---- R4：首尾挂方位/量词，或内部混着连词的串（马歇尔一、带领下、何情况下、山东和华）
EDGE = set("一下中上里前后面个些等所之们")
CONN = set("和与或及并而却乃则即但")
_edge = []
for w in list(AB):
    if "·" in w or w in PROTECT or w in DICT_NR:
        continue
    if len(w) >= 3 and (w[0] in EDGE or w[-1] in EDGE):
        _edge.append(w)
        continue
    if len(w) >= 3 and any(c in CONN for c in w[1:-1]):
        _edge.append(w)
for w in _edge:
    AB.pop(w, None)
print("R4 边角 %d，主表 %d" % (len(_edge), len(AB)), file=sys.stderr)
print("WATCH after R4:", [(k, k in AB) for k in ("林彪","朱德","胡宗南","陈赓","邓小平")], file=sys.stderr)

# ---- R6：姓名称谓尾巴、被截掉的姓氏后缀、省称组合、番号式写法
TAIL_END |= set("致率指记见闻称云道给经在")
_glue2 = []
for w in list(AB):
    if "·" in w or w in PROTECT:
        continue
    e = AB[w]
    for cut in (1, 2):
        pre = w[:-cut] if cut else w
        if len(pre) >= 2 and pre in AB and all(c in TAIL_END for c in w[len(pre):]) \
                and AB[pre]["s"] >= e["s"]:
            te = AB[pre]
            te["lines"] = sorted(set(te["lines"]) | set(e["lines"]))[:600]
            te["mentions"] = max(te["mentions"], e["mentions"])
            _glue2.append(w)
            break
    else:
        for cut in (1, 2):
            suf = w[cut:] if cut else w
            if len(suf) >= 2 and suf != w and suf in AB and w[:cut] in TOP_SUR:
                _glue2.append(w)      # 德怀 ← 彭德怀
                break
for w in set(_glue2):
    AB.pop(w, None)
PROV = set("冀鲁豫晋陕甘宁绥察热辽吉黑白青新云康")
_geoish = [k for k, v in AB.items() if k not in PROTECT and len(k) >= 2 and "·" not in k
           and all(c in PROV for c in k)]
_numish = [k for k, v in AB.items() if k not in PROTECT and len(k) == 2 and k not in DICT_NR
           and k[0] in TOP_SUR and k[1] in "纵军民师旅团"]
for w in set(_geoish) | set(_numish):
    AB.pop(w, None)
_hotword = {w for w in (DICT_WORD | DICT_GEO | DICT_ORG) if DICT_FREQ.get(w, 0) >= 2000 and len(w) == 2}
_inside = [k for k, v in AB.items() if k not in PROTECT and len(k) >= 3 and k not in DICT_NR
           and any(k[i:i + 2] in _hotword for i in range(1, len(k) - 1))]
for w in _inside:
    AB.pop(w, None)
print("R6 尾巴/截断 %d，省称 %d，番号 %d，内嵌常用词 %d，主表 %d"
      % (len(set(_glue2)), len(_geoish), len(_numish), len(_inside), len(AB)), file=sys.stderr)
print("WATCH after R6:", [(k, k in AB) for k in ("林彪","朱德","胡宗南","陈赓","邓小平")], file=sys.stderr)


# ---- R8：区域简称不是人名
REGION = re.compile(r"^[鲁苏冀豫晋陕鄂湘粤桂滇黔川][东南西北中]$|^[冀鲁豫晋陕]{2,3}$")
AB_keep = [k for k in AB if k not in HAND_KEEP and k not in DICT_NR and REGION.match(k)]
for w in AB_keep:
    AB.pop(w, None)

# ---- R7：从不出现在词首的“截断名”，即使是高频也要剔掉
_trunc = []
_long = [k for k, v in AB.items() if len(k) >= 3 and v["mentions"] >= 5]
for w in list(AB):
    if w in HAND_KEEP or "·" in w or len(w) < 2 or w in DICT_NR:
        continue
    if clean_l.get(w, 0) > 0:
        continue
    if any(h != w and (h.startswith(w) or h.endswith(w)) for h in _long):
        _trunc.append(w)
for w in _trunc:
    C1[w] = dict(AB[w], tier="C1")
    AB.pop(w, None)
print("R7 截断 %d，R8 区域简称 %d，主表 %d" % (len(_trunc), len(AB_keep), len(AB)), file=sys.stderr)

# 高置信人名的严格前缀（如“王耀武”截成“王耀”）
_hp = [k for k in AB if AB[k]["mentions"] >= 8 and len(k) >= 3 and k in PROTECT]
_pref = []
for w in list(AB):
    if w not in PROTECT and len(w) >= 2 and any(h.startswith(w) and h != w for h in _hp):
        _pref.append(w)
for w in _pref:
    AB.pop(w, None)
# 动词尾巴（“王辉球报告”型）
_tail2 = [k for k, v in AB.items() if k not in PROTECT and len(k) >= 3 and k not in DICT_NR
          and any(k.endswith(t) for t in BAD_TAIL2) and v["s"] < 20 and k[-1] not in "任"]
for w in _tail2:
    AB.pop(w, None)
print("终局否决后主表 %d（前缀 %d，动词尾 %d）" % (len(AB), len(_pref), len(_tail2)), file=sys.stderr)
print("WATCH final:", [(k, k in AB) for k in ("林彪","朱德","胡宗南","陈赓","邓小平")], file=sys.stderr)
print("WATCH _hp 林彪x:", [h for h in _hp if h.startswith("林彪")][:5], " _known命中:", [L for L in _known if L.endswith("林彪") or L.startswith("林彪")][:5], file=sys.stderr)

# ---------------------------------------------------------------- 姓氏称谓（毛主席/林总/朱总司令）
ADDR = re.compile(r"(?<![一-鿿])([%s])(总司令|总|主席|司令|将军|元帅|主任|部长|行长|总裁|委座)(?![一-鿿])" % CJ)
address = Counter()
for i, ln in enumerate(lines):
    for m in ADDR.finditer(ln):
        if m.group(1) in TOP_SUR:
            address[m.group(0)] += 1

for w, e in AB.items():
    full = sorted(men_lines.get(w, ()) or e["lines"])
    e["nctx"] = max(e["nctx"], len(full))
    e["vols"] = sorted({locs[i][0] for i in full}, key=lambda v: "一二三四五六".index(v) if v in "一二三四五六" else 9)
    e["first"] = loc_str(full[0]) if full else e["first"]
    e["last"] = loc_str(full[-1]) if full else ""
    ls = e["lines"] or full
    ln = lines[ls[len(ls) // 2]]
    p = ln.find(w)
    e["sample"] = ln[max(0, p - 16):p + len(w) + 16].strip() if p >= 0 else ""
    e.pop("lines", None)
    e["ev"] = {k: v for k, v in e["ev"].items() if v}

out = {"names": AB,
       "C1": {k: {"mentions": v["mentions"], "ev": v["ev"], "first": v["first"],
                  "sample": (lambda l: l[max(0, l.find(k) - 12):l.find(k) + len(k) + 12].strip() if k in l else "")(lines[v["lines"][0]])}
              for k, v in C1.items()},
       "compound": sorted(k for k, v in ev.items() if is_compound(k) and (v["jieba"] or v["rank"] or v["tel"])
                          and men.get(k, 0) >= 2),
       "address": address.most_common(200),
       "alias": {k: sorted(v) for k, v in alias.items()},
       "stat": {"A": len(A), "B": len(B), "C1": len(C1), "C2": len(C2), "AB": len(AB),
                "C2_examples": sorted(C2, key=lambda k: -men.get(k, 0))[:40],
                "shape_out": len(out_of_shape),
                "elapsed": round(time.time() - t0), "surnames": len(SUR1)}}
io.open(os.path.join(D, "人名-终版.json"), "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print("完成：主表 %d，存疑 %d，合称 %d，%.0fs" % (len(AB), len(C1), len(out["compound"]), time.time() - t0),
      file=sys.stderr)
