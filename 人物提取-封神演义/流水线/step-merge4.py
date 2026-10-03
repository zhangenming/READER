#!/usr/bin/env python3
"""第3步 归并 v4（最终口径）。
并条边只接受三类：
  A 子串关系（子牙 ⊂ 姜子牙、九公 ⊂ 邓九公）
  B 职称/封号/神号/星号/兽形等「不可能是另一人本名」的形式（武成王、雷祖、角木蛟、白猿）
  C 人工核准表 APPROVE（同姓但确为一人：姜尚/姜子牙、邓九公/邓忠、姬昌/姬伯、苏护/苏让…）
歧义形式（同一写法被两个不同的人各用一次，如 太师、东伯侯、张天君、三太子）一律不并条。
同姓且差 2 字以上的「两个本名」视为兄弟/父子，判为拆条（殷郊/殷洪、姬昌/姬发、方弼/方相…）。
"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PC = os.path.join(ROOT, "per-chunk")
BOOK = re.sub(r"\s+", "", open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"),
                              encoding="utf-8-sig").read())
CACHE = {}


def count(s):
    if s not in CACHE:
        CACHE[s] = BOOK.count(s)
    return CACHE[s]


def N(s):
    return re.sub(r"\s+", "", s or "")


GENERIC = set("""道人 真人 大仙 仙长 仙人 道者 道士 师父 师傅 师娘 师兄 师弟 师叔 师徒 徒弟 徒儿 弟子
童子 童儿 童仆 丫鬟 宫人 宫娥 夫人 太太 老太太 娘娘 奶奶 小姐 姑娘 美人 佳人 御妻 元配 中宫 皇后 王后
国母 太后 大王 老母 老父 父亲 母亲 兄长 兄弟 姊妹 叔叔 舅舅 儿子 女儿 小儿 女娃 孩儿 婴儿
陛下 殿下 千岁 天子 至尊 万岁 官人 相父? 老爷 大老爷 老太师 老师 老人家 老丈 老汉 老叟 老者
将军 大将 众将 武将 战将 牙将 副将 偏将 上将 主将 元戎 总兵 中军 先行 先行官 催粮官 督粮官 运粮官
太守 县令 知县 参将 游击 统领 丞相 宰相 首相 阁老 老臣 大臣 上卿 大夫 上大夫 中大夫 中谏大夫 太师 太傅
太保 少师 亚相? 元帅 大将军 上将军 威武将军 总管 提辖 管营 太子 三太子 大太子 公主 郡主 王妃 国师 相国
末将 小将 某将 众军官 军士 士卒 兵卒 小卒 牙兵 家将 家童 仆人 从者 左右 败将 降将 残兵 诸侯 伯侯 侯伯
君侯 贤侯 国君 昏君 淫妇 逆贼 反臣 乱臣 奸臣 佞臣 贼兵 妖道 妖人 妖邪 魔童 孽障 畜生 匹夫 竖子 鼠辈
众人 众官 满朝 百姓 万民 愚人 炼气士 散人 野人 术士 方士 僧人 道流 道童 仙童 仙官 正神 星官 星君 天君
老神仙 老道 老衲 老奴 老兵 老官 文官 武官 朝臣 臣僚 小人 本人 某人 某某 庶人 天尊 道兄 菩萨 世尊
刺客 杀手 刀斧手 狱官 狱子 太监 阉人 门官 报子 探子 使者 来使 媒人 月老 耕夫 渔翁 樵子 猎人 牧子
童子 童郎 皇兄 皇弟 皇哥 长兄 贤侄 舅爷 外翁 丈人 女婿 夫妻 夫妇 二口 三人 四人 五路 群 等辈""".split())
GENERIC.discard("相父?")
GENERIC.discard("亚相?")

# 合称写法（来自各块 collectives），不得当个人别名并条
COLLECTIVE_FORMS = set()
for fn in sorted(os.listdir(PC)):
    for col in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("collectives") or []:
        COLLECTIVE_FORMS.add(N(col.get("name")))

SUFFIX = tuple("""太师 太傅 丞相 宰相 首相 亚相 元帅 将军 总兵 先锋 先行官 督粮官 大夫 太守 知县 总管
侯 伯 君 公 翁 爷 娘娘 圣母 妃 后 太子 殿下 千岁 大王 真人 道人 天尊 元君 仙 散人 童子 童儿 力士
使者 神 星 星官 星君 天君 真君 大帝 上仙 师 兄 弟 父 母 舅 子 将 官 卒 兵 精 怪 妖 魔 圣 佛 祖
王 主 帅 丞 尹 卿 郎 嫂 姐 妹 女 儿 生 员 医 僧 尼 道 士 人 夫 妻 妾 婢 仆 从 客 友 贼 徒 君侯
君侯 上公 老夫 老臣 上将 大将军 中军 中大夫 上大夫 太公 相父 老爷 大老爷 元帅府 总兵官 镇总兵""".split())
BEAST_TOKEN = tuple("猿狐狸犬雕驼马牛鹿虎龙蛇雀鸡莺鸾鹤豹狼羊豕蝠貉犴豸蚓蛟鼠兔日水金木土火")
STAR_TOKEN = ("星", "宿", "神", "天君", "圣母", "元君", "大帝", "真君", "天尊", "使者", "力士")

APPROVE = {  # 人工核准：确为一人（键为排序后的二元组）
    frozenset(("姜尚", "姜子牙")), frozenset(("姜尚", "子牙")), frozenset(("尚父", "姜尚")),
    frozenset(("邓九公", "邓忠")), frozenset(("九公", "邓忠")),
    frozenset(("苏护", "苏让")), frozenset(("姬昌", "姬伯")), frozenset(("姬昌", "西伯")),
    frozenset(("姬发", "武王")), frozenset(("姬发", "周武")), frozenset(("姬发", "周主")),
    frozenset(("闻仲", "闻太师")), frozenset(("闻仲", "雷祖")),
    frozenset(("陆压", "陆压道人")), frozenset(("云霄", "云霄娘娘")),
    frozenset(("黄飞虎", "东岳")),
    frozenset(("柏鉴", "清福神")), frozenset(("袁洪", "白猿")),
    frozenset(("袁洪", "白面猿猴")), frozenset(("羽翼仙", "大鹏")), frozenset(("羽翼仙", "大鹏雕")),
    frozenset(("余化", "七首将军")), frozenset(("胡喜媚", "九头雉鸡精")),
    frozenset(("妲己", "狐狸精")), frozenset(("妲己", "九尾狐狸精")), frozenset(("妲己", "苏氏")),
    frozenset(("王贵人", "玉石琵琶精")), frozenset(("哮天犬", "仙犬")),
    frozenset(("郑伦", "督粮官")),
    frozenset(("元始天尊", "太上元始")), frozenset(("接引道人", "西方教主")),
    frozenset(("准提道人", "西方教主")),
    frozenset(("散宜生", "散大夫")), frozenset(("黄滚", "老将军")),
    frozenset(("贾氏", "贾夫人")), frozenset(("黄贵妃", "黄妃")), frozenset(("黄贵妃", "黄娘娘")),
    frozenset(("姜皇后", "姜后")), frozenset(("姜皇后", "姜氏")), frozenset(("姜皇后", "中宫")),
    frozenset(("姜皇后", "元配")), frozenset(("杨贵妃", "杨妃")), frozenset(("杨贵妃", "杨氏")),
    frozenset(("冀州侯", "苏护")), frozenset(("西伯侯", "姬昌")),
    frozenset(("太公", "姜子牙")), frozenset(("飞熊", "姜子牙")), frozenset(("相父", "姜子牙")),
    frozenset(("南极仙翁", "白鹿")), frozenset(("孔子", "孔圣")),
    frozenset(("伯邑考", "姬伯邑考")), frozenset(("姬昌", "文王")), frozenset(("姬昌", "文考")),
}
APPROVE = {f for f in APPROVE if len(f) == 2}

entries = []
for fn in sorted(os.listdir(PC)):
    n = int(re.search(r"(\d+)", fn).group(1))
    for c in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("characters", []):
        c["_chunk"] = n
        c["_note"] = c.pop("note", "") or ""
        forms = {N(c.get("name"))} | {N(a) for a in (c.get("aliases") or [])}
        forms.discard("")
        bad = {f for f in forms if f in GENERIC or f in COLLECTIVE_FORMS or len(f) < 2}
        c["_forms"] = sorted(forms - bad)
        c["_dropped"] = sorted(bad)
        if not c["_forms"]:
            continue
        entries.append(c)


class DS:
    def __init__(self):
        self.p = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra

    def groups(self, nodes):
        g = defaultdict(set)
        for n in nodes:
            g[self.find(n)].add(n)
        return g


allf = {f for c in entries for f in c["_forms"]}
base = DS()
for c in entries:
    fs = c["_forms"]
    for x in fs[1:]:
        if x in fs[0] or fs[0] in x:
            base.union(fs[0], x)
bc = base.groups(allf)

approved_edges, rejected = [], []
pair_claims = defaultdict(set)
for c in entries:
    fs = c["_forms"]
    for i in range(len(fs)):
        for j in range(i + 1, len(fs)):
            a, b = fs[i], fs[j]
            if a in b or b in a:
                continue
            pair_claims[frozenset((a, b))].add(base.find(fs[0]))

for pair, owners in pair_claims.items():
    x, y = sorted(pair, key=lambda s: -len(s))
    if len(owners) >= 2:
        rejected.append(("歧义写法·多人共用", x, y, len(owners)))
        continue
    if frozenset(pair) in APPROVE:
        approved_edges.append((x, y, "人工核准"))
        continue
    tx, ty = any(x.endswith(s) for s in SUFFIX), any(y.endswith(s) for s in SUFFIX)
    sx = any(t in x for t in STAR_TOKEN)
    sy = any(t in y for t in STAR_TOKEN)
    beast = any(t in x or t in y for t in ("精", "怪", "猿", "狐", "犬", "雕", "驼", "兽", "蟒", "鹰", "雀"))
    if tx or ty or sx or sy or beast:
        approved_edges.append((x, y, "职称/神号/兽形"))
        continue
    same_sur = x[0] == y[0]
    if same_sur:
        d = abs(len(x) - len(y)) + sum(1 for p, q in zip(x, y) if p != q)
        if d <= 2:
            approved_edges.append((x, y, "同姓形近(讹写)"))
        else:
            rejected.append(("同姓两本名·判为父子兄弟", x, y, 1))
    else:
        rejected.append(("两个本名·无职称关系", x, y, 1))

ds = DS()
ALLOW = {frozenset(p[:2]) for p in approved_edges}
for c in entries:
    fs = c["_forms"]
    for i in range(len(fs)):
        for j in range(i + 1, len(fs)):
            a, b = fs[i], fs[j]
            if a in b or b in a or frozenset((a, b)) in ALLOW:
                ds.union(a, b)
comps = ds.groups(allf)
print("条目:", len(entries), "组件:", len(comps))
print("核准边:", len(approved_edges), " 拒绝边:", len(rejected))

conflicts = []
for root, s in comps.items():
    indep = []
    for v in sorted(s, key=lambda x: (-count(x), -len(x))):
        if not any(v != k and (v in k or k in v) for k in indep):
            indep.append(v)
    strong = [v for v in indep if count(v) >= 25]
    if len(strong) >= 2:
        conflicts.append((sorted(s, key=lambda x: -count(x)), strong))
print("--- 合并后仍含 ≥2 个高频本名的组件", len(conflicts), "（应多为真同人多称，逐条复核）---")
for s, strong in conflicts[:40]:
    print("  ", " ∥ ".join(strong), "<<", "、".join(f"{v}({count(v)})" for v in s[:9]))
print("--- 拒绝边样本（前 60）---")
for r in rejected[:60]:
    print("  ", r)
json.dump({"approved": approved_edges, "rejected": rejected,
           "components": [sorted(s, key=lambda x: -count(x)) for s in comps.values()]},
          open(os.path.join(ROOT, "merge-v4.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
