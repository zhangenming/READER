#!/usr/bin/env python3
"""由 merge-v6.json + per-chunk 原文生成 merged-draft.json（归并稿）。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PC = os.path.join(ROOT, "per-chunk")
BOOK_RAW = open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"), encoding="utf-8-sig").read()
BOOK = re.sub(r"\s+", "", BOOK_RAW)
META = json.load(open(os.path.join(ROOT, "meta.json"), encoding="utf-8"))
PCT = {i: c["pct"] for i, c in enumerate(META["chunks"], 1)}
G = json.load(open(os.path.join(ROOT, "merge-v6.json"), encoding="utf-8"))
CACHE = {}
def count(s):
    if s not in CACHE:
        CACHE[s] = BOOK.count(s)
    return CACHE[s]
def N(s):
    return re.sub(r"\s+", "", s or "")

SUFFIX = tuple("""太师 丞相 首相 元帅 将军 总兵 大夫 侯 公 爷 娘娘 圣母 妃 后 太子 殿下 千岁 大王 真人
道人 天尊 仙 童子 童儿 力士 使者 神 星 星官 天君 真君 大帝 兄 弟 父 母 舅 子 将 官 兵 精 怪 妖 魔 圣
祖 王 主 帅 卿 郎 姐 妹 女 儿 生 员 医 僧 道 士 人 夫 妻 仆 客 贼 徒""".split())
BEAST_TOKEN = ("精", "怪", "猿", "狐", "犬", "雕", "驼", "兽", "蟒", "鹰", "雀", "鹤", "象", "狮", "犼",
               "蛟", "狼", "豹", "貂", "牛", "马", "骡", "獐", "犴", "豸", "蚓", "蝠", "貉", "莺", "牛")


def is_title(v):
    return any(v.endswith(s) for s in SUFFIX) or v in ("星", "将星") or any(t in v for t in BEAST_TOKEN)


ents = G["entries"]
form2ents = defaultdict(list)
for e in ents:
    for f in e["forms"]:
        form2ents[f].append(e)

comps = G["components"]
comp_of = {}
for i, s in enumerate(comps):
    for v in s:
        comp_of[v] = i

# 神号/官职尾缀者：本体是人（受封者），不判为 nonhuman；只有本相为妖兽的才 nonhuman
NONHUMAN_OK = re.compile(r"(精|怪|妖|兽|犬|雕|驼|猿|狐|豹|貂|莺|象|狮|犼|蛟|狼|牛|马|骡|獐|犴|豸|蚓|蝠|貉|雀|鹤|鸾|青牛|金睛|白猿|花狐|墨麒|玉麒|麒麟|四不相|四不象|神牛|云霞兽|乌烟兽|桃花驹|逍遥马|五云驼|金眼驼|奎牛|板角|孔雀|洞仙|夜叉|龙王|泥塑|鬼使|桃精|柳鬼|石矶|琵琶精|狐狸|雉鸡|七寸|长蛇|水牛|猪|羊|蜈蜂|神鹰|鹰)")

characters = []
for s in comps:
    es = [e for f in s for e in form2ents.get(f, [])]
    if not es:
        continue
    # canonical：优先「包含最高频写法的更长写法」，否则取最高频
    top = max(s, key=lambda v: count(v))
    cands = [v for v in s if top in v and len(v) > len(top) and count(v) >= 20]
    canon = max(cands, key=lambda v: (count(v), len(v))) if cands else top
    if count(canon) == 0:
        canon = top
    aliases = sorted([v for v in s if v != canon], key=lambda v: -count(v))
    ident = ""
    for e in sorted(es, key=lambda e: -len(e.get("identity") or "")):
        if e.get("identity"):
            ident = e["identity"]
            break
    nh_votes = sum(1 for e in es if e.get("nonhuman"))
    hum_votes = sum(1 for e in es if not e.get("nonhuman"))
    nonhuman = nh_votes > hum_votes
    if any(NONHUMAN_OK.search(v) for v in s) and nh_votes:
        nonhuman = True
    if not any(NONHUMAN_OK.search(v) for v in s):
        nonhuman = False
    mentioned_only = all(e.get("mentioned_only") for e in es)
    first = min(e["chunk"] for e in es)
    amb = sorted({x for e in es for x in e.get("junk", []) if count(x) >= 2}, key=lambda v: -count(v))[:6]
    notes = sorted({e["note"] for e in es if e.get("note")})
    characters.append({
        "canonical": canon, "aliases": aliases, "identity": ident,
        "nonhuman": nonhuman, "mentioned_only": mentioned_only,
        "first_seen_pct": round(PCT.get(first, 0), 4), "first_chunk": first,
        "forms": sorted(s, key=lambda v: -count(v)),
        "n_entries": len(es), "ambiguous_forms": amb, "notes": notes,
        "importance": "",
    })

def hui(v):
    return len(v) >= 2 and (v[0] + "讳" + v[1:]) in BOOK


# 兜底：写法在全书 0 次的条目剔除并记入 filtered；
# 但第99回封神名单作「星号 姓 讳名」，姓名不连写——这类由「讳」格式佐证，保留。
DROP = {"李吉"}
kept, dropped = [], []
for c in characters:
    forms = [c["canonical"]] + list(c["aliases"])
    if count(c["canonical"]) == 0 and c["canonical"] not in DROP and not any(hui(f) for f in forms):
        dropped.append({"candidate": c["canonical"], "count": 0,
                        "reason": "逐块精读记下的写法在全书找不到对应原文（疑为他块串记或臆造），不予收录",
                        "identity": c["identity"][:40]})
    else:
        kept.append(c)
characters = kept

# 明确非人物：朝代名
FORCED_FILTER = {
    "成汤": "朝代名（成汤=商朝），非人名；诗中偶指开国之君汤，无法判定",
    "西岐": "地名", "朝歌": "地名", "成汤气数": "语词",
}
final, forced_out = [], []
for c in characters:
    if c["canonical"] in FORCED_FILTER:
        forced_out.append({"candidate": c["canonical"], "count": count(c["canonical"]),
                           "reason": FORCED_FILTER[c["canonical"]]})
        continue
    final.append(c)
characters = final

# 合称
colls = defaultdict(lambda: {"refers_to": set(), "chunks": set()})
for fn in sorted(os.listdir(PC)):
    n = int(re.search(r"(\d+)", fn).group(1))
    for col in json.load(open(os.path.join(PC, fn), encoding="utf-8")).get("collectives") or []:
        nm = N(col.get("name"))
        if not nm:
            continue
        e = colls[nm]
        e["refers_to"].update(N(x) for x in (col.get("refers_to") or []) if N(x))
        e["chunks"].add(n)
collectives = []
for nm, e in colls.items():
    rt = []
    for x in sorted(e["refers_to"], key=lambda v: -count(v)):
        if count(x) == 0 and "讳" not in x:
            continue
        rt.append(x)
    collectives.append({"name": nm, "refers_to": rt[:12], "count": count(nm), "chunks": len(e["chunks"])})
collectives.sort(key=lambda c: (-c["count"], -c["chunks"]))

draft = {"book": "封神演义", "characters": characters, "collectives": collectives,
         "filtered": dropped + forced_out, "_stats": {"精读条目": len(ents), "并条后人物": len(characters),
                                                      "剔除": len(dropped) + len(forced_out)}}
json.dump(draft, open(os.path.join(ROOT, "merged-draft.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("人物:", len(characters), " 合称:", len(collectives), " 过滤:", len(draft["filtered"]))
print("提及合计（按 canonical 计）:", sum(count(c["canonical"]) for c in characters))
print("nonhuman:", sum(1 for c in characters if c["nonhuman"]),
      " 仅提及:", sum(1 for c in characters if c["mentioned_only"]))
for c in sorted(characters, key=lambda x: -count(x[0] if False else x["canonical"]))[:20]:
    print(f"  {c['canonical']}({count(c['canonical'])}) 别名{len(c['aliases'])} "
          f"{'非人' if c['nonhuman'] else ''} {'仅提' if c['mentioned_only'] else ''} 首见{c['first_seen_pct']:.0%}")
