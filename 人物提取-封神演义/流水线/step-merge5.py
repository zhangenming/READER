#!/usr/bin/env python3
"""第3步 归并 v5（最终口径）。

并条规则（可审计）：
  A 子串关系：飞虎 ⊂ 黄飞虎、九公 ⊂ 邓九公、云霄 ⊂ 云霄娘娘 → 直接并条
  B 职称/封号/神号/星号/兽形 ↔ 本名：武成王↔黄飞虎、雷祖↔闻仲、角木蛟↔柏林 → 并条
    前提：该称号写法在全书只指向一个人（指向两人的如 太师/东伯侯/张天君/三太子 → 判为歧义，不并）
  C 人工核准表：形近讹写与「同姓但同一人」（苏护↔苏让、张桂方↔张桂芳、姜尚↔姜子牙、邓九公↔邓忠…）
  D 其余「两个本名」一律不并（殷郊/殷洪、姬昌/姬发、方弼/方相、崇侯虎/崇黑虎 是兄弟父子，不是别名）
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
国母 太后 大王 老母 老父 父亲 母亲 兄长 兄弟 姊妹 叔叔 舅舅 儿子 女儿 小儿 女娃 孩儿 婴儿 老夫人 老太太
陛下 殿下 千岁 天子 至尊 万岁 官人 相公 老爷 大老爷 老太师 老师 老人家 老丈 老汉 老叟 老者 老将军 老前辈
将军 大将 众将 武将 战将 牙将 副将 偏将 上将 主将 元戎 总兵 中军 先行 先行官 催粮官 督粮官 运粮官 总督
太守 县令 知县 参将 游击 统领 丞相 宰相 首相 阁老 老臣 大臣 上卿 大夫 上大夫 中大夫 中谏大夫 太师 太傅
太保 少师 亚相 元帅 大将军 上将军 威武将军 总管 提辖 管营 太子 三太子 大太子 公主 郡主 王妃 国师 相国
末将 小将 某将 众军官 军士 士卒 兵卒 小卒 牙兵 家将 家童 仆人 从者 左右 败将 降将 残兵 诸侯 伯侯 侯伯
君侯 贤侯 国君 昏君 淫妇 逆贼 反臣 乱臣 奸臣 佞臣 谗臣 贼兵 妖道 妖人 妖邪 魔童 孽障 畜生 匹夫 竖子
众人 众官 满朝 百姓 万民 愚人 炼气士 散人 野人 术士 方士 僧人 道流 道童 仙童 仙官 正神 星官 星君 天君
老神仙 老道 老衲 老奴 老兵 老官 文官 武官 朝臣 臣僚 小人 本人 某人 某某 庶人 天尊 道兄 菩萨 世尊 明公
刺客 杀手 刀斧手 狱官 狱子 太监 阉人 门官 报子 探子 使者 来使 媒人 耕夫 渔翁 樵子 猎人 牧子 皇兄 皇弟
皇哥 长兄 贤侄 舅爷 外翁 丈人 女婿 夫妻 夫妇 大娘 姆姆 二哥 大哥 三哥 令尊 令堂 贤弟 吾兄 吾弟 若辈
二殿下 长殿下 殷殿下 殷千岁 二口 三人 四人 五路 混元教主 上公 圣母 娘娘爷 首相老爷 太师爷 太师老爷
开山莽将 开路神 显道神 镇殿将军 镇殿大将军 督粮上将 奉天征讨大元戎 威武大将军 威武上将军 中斗星官
腾雾显圣真君 值年太岁 执掌东宫太监 巡海夜叉 七首妖雕 本宫 孤 寡人 朕 吾 尔 妾身 哀家 奴 婢 仆""".split())

COLLECTIVE_FORMS = set()
for fn in sorted(os.listdir(PC)):
    for col in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("collectives") or []:
        COLLECTIVE_FORMS.add(N(col.get("name")))

# 一书之内被两个人各自用过的写法——既不作人名收录，也不参与并条
AMBIG = set("""太师 丞相 首相 老丞相 上大夫 中大夫 中谏大夫 大夫 太子 三太子 殿下 千岁 二殿下 长殿下
殷殿下 老殿下 东伯侯 南伯侯 西伯侯 北伯侯 君侯 崇君侯 老将军 将军 总兵 黄总兵 张总兵 先行官 正印先行
督粮官 催粮官 运粮官 中军 元帅 主将 上将 元戎 夫人 娘娘 黄娘娘 姜娘娘 公主 公子 世子 老爷 大老爷
姜老爷 姜公 老爷儿 太师老爷 太师爷 老臣 大臣 奸臣 佞臣 谗臣 昏君 天子 陛下 殿下爷 大王 至尊 万岁
张天君 邓天君 秦天君 姚天君 王天君 赵天君 金天君 白天君 齐天君 李天君 孙天君 冲天君 随天君
圣母 元君 星官 星君 正神 天使 使者 高士 散士 道者 炼气士 野人 术士 羽士 门人 弟子 徒弟 孩儿 小畜
生 末将 部将 偏将 副将 牙将 战将 众将 家将 开山莽将 镇殿大将军 威武将军 威武大将军 上将军 大将军
大元帅 征西大元帅 奉天征讨大元戎 两路大元帅 总督兵马大将军 中大夫 都统 提辖 太守 县令""".split())

SUFFIX = tuple("""太师 太傅 丞相 首相 亚相 元帅 将军 总兵 先行官 督粮官 大夫 太守 知县 总管 侯 伯 君 公
翁 爷 娘娘 圣母 妃 后 太子 殿下 千岁 大王 真人 道人 天尊 元君 仙 散人 童子 童儿 力士 使者 神 星 星官
星君 天君 真君 大帝 上仙 师 兄 弟 父 母 舅 子 将 官 卒 兵 精 怪 妖 魔 圣 佛 祖 王 主 帅 丞 尹 卿 郎
嫂 姐 妹 女 儿 生 员 医 僧 尼 道 士 人 夫 妻 妾 婢 仆 从 客 友 贼 徒 君侯 相公 老爷 相父 太公 山 海""".split())
STAR_TOKEN = ("星", "宿", "神", "天君", "圣母", "元君", "大帝", "真君", "天尊", "使者", "力士", "明王")
BEAST_TOKEN = ("精", "怪", "猿", "狐", "犬", "雕", "驼", "兽", "蟒", "鹰", "雀", "鹤", "象", "狮", "犼")

# 形近讹写 / 同姓确为一人（人工核定）
TYPO = {frozenset(p) for p in [
    ("苏护", "苏让"), ("张桂芳", "张桂方"), ("张桂芳", "张柱芳"), ("南宫适", "南宫造"),
    ("云霄", "云宵"), ("余元", "余原"), ("马元", "马原"), ("邓婵玉", "邓蝉玉"),
    ("胡喜媚", "胡喜妹"), ("闻太师", "闻大师"), ("韦护", "韦谨"), ("杨戬", "榻戬"),
    ("龙须虎", "龙鬃虎"), ("姬昌", "姬伯"), ("姬昌", "姬侯"), ("姬昌", "姬贤伯"),
    ("鄂崇禹", "鄂祟禹"), ("鄂崇禹", "崇禹"), ("姜桓楚", "东伯姜桓楚"), ("木吒", "木咤"),
    ("金吒", "金咤"), ("黄飞虎", "飞虎"), ("菡芝仙", "含芝仙"), ("高明", "高皋?"),
]}
APPROVE = {frozenset(p) for p in [
    ("姜尚", "姜子牙"), ("姜尚", "子牙"), ("姜尚", "尚父"), ("姜尚", "飞熊"), ("姜尚", "太公"),
    ("姜尚", "子牙公"), ("邓九公", "邓忠"), ("邓九公", "九公"),
    ("闻仲", "闻太师"), ("闻仲", "雷祖"), ("殷受", "纣王"), ("殷受", "帝辛"),
    ("殷受", "受德"), ("殷受", "受辛"), ("商受", "纣王"), ("辛纣", "纣王"),
    ("袁洪", "白猿"), ("袁洪", "白面猿猴"), ("袁洪", "白猿精"), ("羽翼仙", "大鹏"),
    ("羽翼仙", "大鹏雕"), ("妲己", "狐狸精"), ("妲己", "九尾狐狸精"), ("妲己", "苏氏"),
    ("胡喜媚", "九头雉鸡精"), ("王贵人", "玉石琵琶精"), ("哮天犬", "仙犬"),
    ("柏鉴", "清福神"), ("哪吒", "灵珠子"), ("余化", "七首将军"),
    ("元始天尊", "太上元始"), ("接引道人", "西方教主"), ("准提道人", "西方教主"),
    ("土行孙", "俱留孙"), ("林开", "开山莽将"), ("龙吉公主", "瑶池金母"),
    ("黄飞彪", "飞彪"), ("黄飞豹", "飞豹"), ("黄天祥", "天祥"), ("黄天爵", "天爵"),
    ("黄天禄", "天禄"), ("黄明", "子明?"), ("孙子羽", "子羽"), ("吴谦", "子让?"),
    ("龙环", "环?"), ("郑伦", "督粮官"), ("陈奇", "元从神鹰将"),
    ("陆压", "陆压道人"), ("洪锦", "洪将军"), ("苏全忠", "全忠"), ("姬发", "周武"),
]}
APPROVE = {f for f in APPROVE if len(f) == 2 and "" not in f}
TYPO = {f for f in TYPO if len(f) == 2 and "?" not in "".join(f)}


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


entries = []
for fn in sorted(os.listdir(PC)):
    n = int(re.search(r"(\d+)", fn).group(1))
    for c in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("characters", []):
        c["_chunk"] = n
        c["_note"] = c.pop("note", "") or ""
        forms = {N(c.get("name"))} | {N(a) for a in (c.get("aliases") or [])}
        forms.discard("")
        junk = {f for f in forms if f in GENERIC or f in COLLECTIVE_FORMS or len(f) < 2}
        amb = {f for f in forms if f in AMBIG}
        c["_forms"] = sorted(forms - junk - amb)
        c["_amb"] = sorted(amb)
        c["_dropped_forms"] = sorted(junk)
        if c["_forms"]:
            entries.append(c)

allf = {f for c in entries for f in c["_forms"]}
# 1) 子串基簇
base = DS()
for c in entries:
    fs = c["_forms"]
    for i in range(len(fs)):
        for j in range(i + 1, len(fs)):
            if fs[i] in fs[j] or fs[j] in fs[i]:
                base.union(fs[i], fs[j])
basec = base.groups(allf)


def is_title(v):
    return any(v.endswith(s) for s in SUFFIX) or any(t in v for t in STAR_TOKEN + BEAST_TOKEN) \
        or v in GENERIC


def cluster_has_name(cid):
    return any(not is_title(v) for v in basec[cid])


# 2) 非子串断言边：按「称号↔本名 / 人工核准 / 两个本名」三类处置
edges = defaultdict(set)
anchor = {}
for c in entries:
    fs = c["_forms"]
    for i in range(len(fs)):
        for j in range(i + 1, len(fs)):
            a, b = fs[i], fs[j]
            if a in b or b in a:
                continue
            ca, cb = base.find(a), base.find(b)
            if ca != cb:
                edges[frozenset((ca, cb))].add(c["_chunk"])

ds = DS()
for f in allf:
    ds.find(f)
for c in entries:
    fs = c["_forms"]
    for i in range(len(fs)):
        for j in range(i + 1, len(fs)):
            if fs[i] in fs[j] or fs[j] in fs[i]:
                ds.union(fs[i], fs[j])

used, skipped, acc_edges = defaultdict(int), [], []
for pair, chunks in edges.items():
    ca, cb = sorted(pair, key=lambda x: -len(basec[x]))
    va, vb = max(basec[ca], key=len), max(basec[cb], key=len)
    ok = None
    if any(frozenset((x, y)) in APPROVE or frozenset((x, y)) in TYPO
           for x in basec[ca] for y in basec[cb]):
        ok = "人工核准"
    else:
        ha, hb = cluster_has_name(ca), cluster_has_name(cb)
        if ha ^ hb:
            ok = "称号↔本名"
        elif not ha and not hb:
            ok = "称号↔称号"
    if ok:
        acc_edges.append((ok, va, vb, sorted(basec[ca]), sorted(basec[cb]), len(chunks)))
        for x in basec[ca]:
            for y in basec[cb]:
                ds.union(x, y)
        used[ok] += 1
    else:
        skipped.append(("两个本名·判为不同人", va, vb, len(chunks)))

comps = ds.groups(allf)
print("条目:", len(entries), " 形式:", len(allf), " 并条后组件:", len(comps))
print("并条边:", sum(used.values()), dict(used), " 拒边:", len(skipped))

conf = []
for root, s in comps.items():
    indep = []
    for v in sorted(s, key=lambda x: (-count(x), -len(x))):
        if not any(v != k and (v in k or k in v) for k in indep):
            indep.append(v)
    strong = [v for v in indep if count(v) >= 25 and not is_title(v)]
    if len(strong) >= 2:
        conf.append((sorted(s, key=lambda x: -count(x)), strong))
print("--- 仍含 ≥2 个高频本名的组件", len(conf), "---")
for s, strong in conf[:30]:
    print("  ", " ∥ ".join(strong), "<<", "、".join(f"{v}({count(v)})" for v in s[:8]))
json.dump({"components": [sorted(s, key=lambda x: -count(x)) for s in comps.values()],
           "accepted_edges": acc_edges,
           "skipped_edges": skipped,
           "generic_forms": sorted(GENERIC | COLLECTIVE_FORMS)},
          open(os.path.join(ROOT, "merge-v5.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
