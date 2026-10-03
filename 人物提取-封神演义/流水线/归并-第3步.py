#!/usr/bin/env python3
"""第3步 归并 v6（定稿口径）。

基簇：子串关系自动并（飞虎 ⊂ 黄飞虎）。
并条三类：
  1) 本名簇 ↔ 本名簇：仅当在人工核准表（形近讹写、姜尚↔姜子牙、邓九公↔邓忠、闻仲↔闻太师…）
  2) 称号簇（不含本名，如 武成王/北斗星官/西伯文王/雷祖/角木蛟）→ 只挂到「唯一主人」：
     该书里这个称号只被一个人用过才并条；被两人以上用过（太师/皇伯/黄公子/北斗星官/西伯文王）
     → 不并任何人，进「歧义写法」附录，可翻案。
  3) 泛称（道人/陛下/将军/娘娘…）与合称（十二金仙/魔家四将…）不作为人名形式收录。
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
国母 太后 大王 老母 老父 父亲 母亲 兄长 兄弟 姊妹 叔叔 舅舅 儿子 女儿 小儿 女娃 孩儿 婴儿 老夫人
陛下 殿下 千岁 天子 至尊 万岁 官人 相公 老爷 大老爷 老太师 老师 老人家 老丈 老汉 老叟 老者 老将军
将军 大将 众将 武将 战将 牙将 副将 偏将 上将 主将 元戎 总兵 中军 先行 先行官 催粮官 督粮官 运粮官 总督
太守 县令 知县 参将 游击 统领 丞相 宰相 首相 阁老 老臣 大臣 上卿 大夫 上大夫 中大夫 中谏大夫 太师 太傅
太保 少师 亚相 元帅 大将军 上将军 威武将军 总管 提辖 管营 太子 三太子 大太子 公主 郡主 王妃 国师 相国
末将 小将 某将 众军官 军士 士卒 兵卒 小卒 牙兵 家将 家童 仆人 从者 左右 败将 降将 残兵 诸侯 伯侯 侯伯
君侯 贤侯 国君 昏君 淫妇 逆贼 反臣 乱臣 奸臣 佞臣 谗臣 贼兵 妖道 妖人 妖邪 魔童 孽障 畜生 匹夫 竖子
众人 众官 满朝 百姓 万民 愚人 炼气士 散人 野人 术士 方士 僧人 道流 道童 仙童 仙官 正神 星官 星君 天君
老神仙 老道 老衲 老奴 老兵 老官 文官 武官 朝臣 臣僚 小人 本人 某人 某某 庶人 天尊 道兄 菩萨 世尊 明公
刺客 杀手 刀斧手 狱官 太监 阉人 门官 报子 探子 使者 来使 媒人 耕夫 渔翁 樵子 猎人 皇兄 皇弟 皇哥 长兄
贤侄 舅爷 外翁 丈人 女婿 夫妻 夫妇 大娘 姆姆 二哥 大哥 三哥 令尊 令堂 贤弟 吾兄 吾弟 若辈 孤 寡人
圣母 元君 天使 高士 门人 弟子 孩儿 部将 家丁 庄丁 田夫 村妇 妇人 男子 女子 小儿女 官军 王师 舟人
火化工 厨子 屠户 医士 卜者 星士 相士 阴阳 讼师 师婆 稳婆 产妇 罪妇 刑人 囚徒 徒隶 役夫 脚夫 马卒""".split())

COLLECTIVE_FORMS = set()
for fn in sorted(os.listdir(PC)):
    for col in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("collectives") or []:
        COLLECTIVE_FORMS.add(N(col.get("name")))

SUFFIX = tuple("""太师 太傅 丞相 首相 亚相 元帅 将军 总兵 先行官 督粮官 大夫 太守 知县 总管 侯 伯 君 公
翁 爷 娘娘 圣母 妃 后 太子 殿下 千岁 大王 真人 道人 天尊 元君 仙 散人 童子 童儿 力士 使者 神 星 星官
星君 天君 真君 大帝 上仙 师 兄 弟 父 母 舅 子 将 官 卒 兵 精 怪 妖 魔 圣 佛 祖 王 主 帅 丞 尹 卿 郎
嫂 姐 妹 女 儿 生 员 医 僧 尼 道 士 人 夫 妻 妾 婢 仆 从 客 友 贼 徒 君侯 相公 老爷 相父 太公""".split())
STAR_TOKEN = ("星", "宿", "神", "天君", "圣母", "元君", "大帝", "真君", "天尊", "使者", "力士", "明王")
BEAST_TOKEN = ("精", "怪", "猿", "狐", "犬", "雕", "驼", "兽", "蟒", "鹰", "雀", "鹤", "象", "狮", "犼",
               "蛟", "狼", "虎", "龙", "豹", "羊", "犬")

TYPO = {frozenset(p) for p in [
    ("苏护", "苏让"), ("张桂芳", "张桂方"), ("张桂芳", "张柱芳"), ("南宫适", "南宫造"),
    ("云霄", "云宵"), ("余元", "余原"), ("马元", "马原"), ("邓婵玉", "邓蝉玉"),
    ("胡喜媚", "胡喜妹"), ("闻太师", "闻大师"), ("韦护", "韦谨"), ("杨戬", "榻戬"),
    ("龙须虎", "龙鬃虎"), ("姬昌", "姬伯"), ("姬昌", "姬侯"), ("姬昌", "姬贤伯"),
    ("鄂崇禹", "鄂祟禹"), ("木吒", "木咤"), ("金吒", "金咤"), ("菡芝仙", "含芝仙"),
    ("高明", "高暻"), ("殷郊", "殷胶"), ("黄滚", "黄兙"),
]}
APPROVE = {frozenset(p) for p in [
    ("姜尚", "姜子牙"), ("姜尚", "子牙"), ("姜尚", "尚父"), ("姜尚", "飞熊"), ("姜尚", "太公"),
    ("姜尚", "子牙公"), ("姜尚", "吕望"), ("邓九公", "邓忠"), ("邓九公", "九公"),
    ("闻仲", "闻太师"), ("闻仲", "雷祖"), ("殷受", "纣王"), ("殷受", "帝辛"), ("殷受", "受德"),
    ("殷受", "受辛"), ("商受", "纣王"), ("辛纣", "纣王"), ("袁洪", "白猿"), ("袁洪", "白面猿猴"),
    ("袁洪", "白猿精"), ("羽翼仙", "大鹏"), ("羽翼仙", "大鹏雕"), ("妲己", "狐狸精"),
    ("妲己", "九尾狐狸精"), ("妲己", "苏氏"), ("胡喜媚", "九头雉鸡精"), ("王贵人", "玉石琵琶精"),
    ("哮天犬", "仙犬"), ("柏鉴", "清福神"), ("哪吒", "灵珠子"), ("余化", "七首将军"),
    ("元始天尊", "太上元始"), ("接引道人", "西方教主"), ("土行孙", "俱留孙"),
    ("黄飞彪", "飞彪"), ("黄飞豹", "飞豹"), ("黄天祥", "天祥"), ("黄天爵", "天爵"),
    ("黄天禄", "天禄"), ("孙子羽", "子羽"), ("郑伦", "督粮官"), ("陆压", "陆压道人"),
    ("洪锦", "洪将军"), ("苏全忠", "全忠"), ("姬发", "周武"), ("姬发", "武王"), ("姬昌", "文王"),
    ("孔子", "孔圣"), ("微子", "微子启"), ("杨任", "任光禄?"), ("龙环", "环?"),
]}
APPROVE = {f for f in APPROVE if len(f) == 2 and all("?" not in x for x in f)}


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
        c["_forms"] = sorted(forms - junk)
        c["_junk"] = sorted(junk)
        if c["_forms"]:
            entries.append(c)

allf = {f for c in entries for f in c["_forms"]}
base = DS()
for c in entries:
    fs = c["_forms"]
    for i in range(len(fs)):
        for j in range(i + 1, len(fs)):
            if fs[i] in fs[j] or fs[j] in fs[i]:
                base.union(fs[i], fs[j])
basec = base.groups(allf)


def is_title(v):
    return v in GENERIC or any(v.endswith(s) for s in SUFFIX) \
        or any(t in v for t in STAR_TOKEN) or any(t in v for t in BEAST_TOKEN)


def has_name(cid):
    return any(not is_title(v) for v in basec[cid])


ds = DS()
for f in allf:
    ds.find(f)
for c in entries:
    fs = c["_forms"]
    for i in range(len(fs)):
        for j in range(i + 1, len(fs)):
            if fs[i] in fs[j] or fs[j] in fs[i]:
                ds.union(fs[i], fs[j])

orphan_titles, attached, forced = [], 0, []
for _r in range(6):
    comp = ds.groups(allf)
    named = {r for r in comp if any(not is_title(v) for v in comp[r])}
    root_of = {f: ds.find(f) for f in allf}
    co = defaultdict(int)
    for c in entries:
        rs = sorted({root_of[x] for x in c["_forms"]})
        for i in range(len(rs)):
            for j in range(i + 1, len(rs)):
                co[(rs[i], rs[j])] += 1
    att = defaultdict(dict)
    for (x, y), w in co.items():
        nx, ny = x in named, y in named
        if nx == ny:
            continue
        t, n = (y, x) if nx else (x, y)
        att[t][n] = att[t].get(n, 0) + w
    changed = 0
    orphan_titles = []
    for t, owners in att.items():
        best = sorted(owners.items(), key=lambda kv: -kv[1])
        if len(best) == 1 or best[0][1] > best[1][1]:
            for a in comp[t]:
                for b in comp[best[0][0]]:
                    if ds.find(a) != ds.find(b):
                        ds.union(a, b)
                        changed += 1
            attached += 1
        else:
            orphan_titles.append((sorted(comp[t], key=lambda v: -count(v)),
                                  {sorted(comp[o], key=lambda v: -count(v))[0]: w for o, w in best[:4]}))
    for (x, y) in [k for k, v in co.items() if k[0] in named and k[1] in named]:
        if any(frozenset((a, b)) in APPROVE or frozenset((a, b)) in TYPO
               for a in comp[x] for b in comp[y]):
            for a in comp[x]:
                for b in comp[y]:
                    if ds.find(a) != ds.find(b):
                        ds.union(a, b)
                        changed += 1
            forced.append((sorted(comp[x], key=lambda v: -count(v))[0],
                           sorted(comp[y], key=lambda v: -count(v))[0]))
    if not changed:
        break

comps = ds.groups(allf)
comps = ds.groups(allf)
print("人物条目:", len(entries), " 写法:", len(allf), " 并条后组件:", len(comps))
print("称号挂主人:", attached, " 称号被两人以上共用(不并):", len(orphan_titles),
      " 人工核准并条:", len(forced))

conf = []
for root, s in comps.items():
    indep = []
    for v in sorted(s, key=lambda x: (-count(x), -len(x))):
        if not any(v != k and (v in k or k in v) for k in indep):
            indep.append(v)
    strong = [v for v in indep if count(v) >= 25 and not is_title(v)]
    if len(strong) >= 2:
        conf.append((sorted(s, key=lambda x: -count(x)), strong))
print("--- 仍含 ≥2 个高频本名的组件", len(conf), "（逐条确认是否为同一人）---")
for s, strong in conf[:20]:
    print("  ", " ∥ ".join(strong), "<<", "、".join(f"{v}({count(v)})" for v in s[:8]))
print("--- 歧义称号样本 ---")
for forms, owners in sorted(orphan_titles, key=lambda x: -max(count(f) for f in x[0]))[:18]:
    print("  ", "、".join(forms[:4]), "→ 争:", {k: v for k, v in owners.items()})
json.dump({"components": [sorted(s, key=lambda x: -count(x)) for s in comps.values()],
           "orphan_titles": [[f, o] for f, o in orphan_titles],
           "forced": forced,
           "junk_forms": sorted(GENERIC | COLLECTIVE_FORMS),
           "entries": [{"forms": c["_forms"], "junk": c["_junk"], "chunk": c["_chunk"],
                        "identity": c.get("identity"), "nonhuman": c.get("nonhuman"),
                        "mentioned_only": c.get("mentioned_only"), "evidence": c.get("evidence"),
                        "note": c["_note"]} for c in entries]},
          open(os.path.join(ROOT, "merge-v6.json"), "w", encoding="utf-8"), ensure_ascii=False)
