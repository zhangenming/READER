#!/usr/bin/env python3
"""归并 v3：泛称黑名单 + 只信任「proper 形式」之间的并条边，并打印冲突供人工裁决。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PC = os.path.join(ROOT, "per-chunk")
BOOK = re.sub(r"\s+", "", open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"),
                              encoding="utf-8-sig").read())
CACHE = {}


def count(s):
    if s in CACHE:
        return CACHE[s]
    c, i = 0, BOOK.find(s)
    while i >= 0:
        c += 1
        i = BOOK.find(s, i + 1)
    CACHE[s] = c
    return c


def N(s):
    return re.sub(r"\s+", "", s or "")


# 裸职称/亲属/敬谦称——不特指某人，一律不得作为人名形式收录或并条
GENERIC = set("""道人 真人 大仙 仙长 仙人 道者 道士 师父 师傅 师娘 师兄 师弟 师叔 师徒 徒弟 徒儿 弟子
童子 童儿 童仆 丫鬟 宫人 宫娥 夫人 太太 老太太 娘娘 奶奶 小姐 姑娘 美人 佳人 御妻 元配 中宫 皇后 王后
国母 太后 大王 老母 老父 父亲 母亲 兄长 兄弟 姊妹 叔叔 舅舅 儿子 女儿 小儿 女娃 孩儿 婴儿 童子
陛下 殿下 千岁 天子 至尊 万岁 官人 相公 老爷 大老爷 老太师 老师 老人家 老丈 老汉 老叟 老者 村佬
将军 大将 众将 武将 战将 牙将 副将 偏将 上将 主将 元戎 总兵 中军 先行 先行官 催粮官 督粮官 运粮官
太守 太守 县令 知县 参将 游击 都司 统领 督府 丞相 宰相 首相 阁老 老臣 大臣 上卿 下卿 大夫 上大夫
中大夫 中谏大夫 太师 太傅 太保 少师 亚相 丞相老爷 元帅 大将军 上将军 威武将军 总管 提辖 管营
末将 小将 某将 众军官 军士 士卒 兵卒 小卒 牙兵 家将 家童 仆人 从者 左右 本部 败将 降将 残兵
诸侯 伯侯 侯伯 君侯 贤侯 我侯 本侯 王 公 侯 伯 子 男 国君 昏君 淫妇 逆贼 反臣 乱臣 奸臣 佞臣
贼兵 妖道 妖人 妖邪 魔童 孽障 业障 畜生 匹夫 竖子 鼠辈 尔等 众人 众官 满朝 百姓 万民 愚人
真人老爷 天上仙人 炼气士 散人 野人 术士 方士 僧人 道流 道童 仙童 仙官 正神 星官 星君 天君
大王老爷 老神仙 老道 老衲 老奴 老兵 老官 大小将佐 文武 文官 武官 朝臣 臣僚 官职 职名
太子 三太子 大太子 二太子 殿下千岁 公主 郡主 王妃 国师 相国 小人 本人 某人 某某 下民 庶人
混元教主 天尊 道兄 道姐 师兄 菩萨 世尊 世主 圣主 明公 阁下 足下 卿卿 爱卿 将军老爷""".split())
# 单字残形（姓或名的半截），绝不收录
SINGLE = set()


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


entries, dropped_generic_only = [], []
for fn in sorted(os.listdir(PC)):
    n = int(re.search(r"(\d+)", fn).group(1))
    for c in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("characters", []):
        c["_chunk"] = n
        c["_note"] = c.pop("note", "") or ""
        forms = {N(c.get("name"))} | {N(a) for a in (c.get("aliases") or [])}
        forms.discard("")
        proper = {f for f in forms if f not in GENERIC and len(f) >= 2}
        c["_forms"] = sorted(proper)
        c["_generic_forms"] = sorted(forms & GENERIC)
        if not proper:
            dropped_generic_only.append(c)
            continue
        entries.append(c)

ds = DS()
for c in entries:
    fs = c["_forms"]
    for x in fs[1:]:
        ds.union(fs[0], x)
nodes = {f for c in entries for f in c["_forms"]}
comps = ds.groups(nodes)
print("有效人物条目:", len(entries), " 被弃的纯泛称条目:", len(dropped_generic_only))
print("组件数:", len(comps))

# 冲突检测：一个组件里出现两把「互不包含的高频正式姓名」=> 可能被桥错
conflicts = []
for root, s in comps.items():
    hi = [v for v in s if count(v) >= 30]
    keep = []
    for v in sorted(hi, key=lambda x: (-len(x), -count(x))):
        if not any(v in k or k in v for k in keep):
            keep.append(v)
    if len(keep) >= 2:
        conflicts.append((sorted(s, key=lambda x: -count(x)), keep))
print("--- 仍冲突的组件", len(conflicts), "---")
for s, keep in conflicts:
    print("  判定候选:", " ∥ ".join(keep), "|| 全组件:",
          "、".join(f"{v}({count(v)})" for v in s[:10]))
json.dump({"generic_only_dropped": [{"name": c.get("name"), "chunk": c["_chunk"],
                                     "forms": c["_generic_forms"]} for c in dropped_generic_only],
           "components": [sorted(s, key=lambda x: -count(x)) for s in comps.values()]},
          open(os.path.join(ROOT, "merge-graph.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
