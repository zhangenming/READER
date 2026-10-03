#!/usr/bin/env python3
"""归并 v4 预备：把非子串别名对分成「职称/神号/兽号可自动并条」与「需人工裁决」两堆。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PC = os.path.join(ROOT, "per-chunk")
BOOK = re.sub(r"\s+", "", open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"),
                              encoding="utf-8-sig").read())


def count(s):
    return BOOK.count(s)


def N(s):
    return re.sub(r"\s+", "", s or "")


# 尾缀为职衔/封号/神号/亲属敬称——不可能是另一个人的本名，可安全并条
SUFFIX = tuple("""太师 太傅 太保 丞相 宰相 首相 亚相 元帅 将军 大将军 总兵 参将 副将 先锋 先行官 督粮官
运粮官 中大夫 上大夫 大夫 太守 县令 知县 总管 提辖 管军 侯 伯侯 君侯 诸侯 公 翁 叟 老爷 老爷儿 爷 娘娘
圣母 妃 后 皇后 王后 太子 殿下 千岁 大王 真人 道人 道者 道士 天尊 元君 仙 仙翁 散人 野人 童子 童儿 力士
使者 神 正神 星 星官 星君 天君 真君 大帝 大帝君 上仙 仙长 师父 师 师兄 师弟 师叔 兄 弟 父 母 舅 翁 子
将 官 卒 兵 贼 寇 精 怪 妖 魔 圣 佛 祖 君 王 主 帅 尉 尉 丞 尹 卿 大夫 郎 嫂 姐 妹 女 儿 生 员 匠 医
巫 卜 僧 尼 道 士 人 夫 妻 妾 婢 仆 从 客 友 贼 徒 党 曹 辈 号 号 名 讳""".split())
# 含动物/星宿字样，多为本体或神号
BEAST = tuple("龙虎熊虎豹狼鹿羊马牛鸡犬猴蛇猪龟鹤鸾雕莺驼骡驴獐犴豸蚓蝠貉蛟猿狐狸狼".strip())

entries = []
for fn in sorted(os.listdir(PC)):
    n = int(re.search(r"(\d+)", fn).group(1))
    for c in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("characters", []):
        c["_chunk"] = n
        entries.append(c)

claim = defaultdict(set)   # alias -> set of name-forms claiming it
for c in entries:
    nm = N(c.get("name"))
    for a in {N(x) for x in (c.get("aliases") or [])}:
        if not a or a == nm or len(a) < 2:
            continue
        if a in nm or nm in a:
            continue
        claim[a].add(nm)

auto, hand = [], []
for a, names in claim.items():
    title = any(a.endswith(s) for s in SUFFIX) or any(x in a for x in ("星", "宿", "神", "天君", "圣"))
    if len(names) >= 2:
        hand.append(("歧义·多主张", a, sorted(names), count(a)))
    elif title:
        auto.append((list(names)[0], a))
    else:
        hand.append(("两姓名疑兄弟", a, sorted(names), count(a)))

print("自动并条（职称/神号类）:", len(auto))
print("需裁决:", len(hand))
for kind, a, names, c in sorted(hand, key=lambda x: -x[3]):
    print(f"  [{kind}] {a}({c}) ← {names}")
json.dump({"auto": auto, "hand": [[k, a, n, c] for k, a, n, c in hand]},
          open(os.path.join(ROOT, "alias-classes.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
