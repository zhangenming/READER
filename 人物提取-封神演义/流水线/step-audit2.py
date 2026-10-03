#!/usr/bin/env python3
"""召回审计裁决 v2：先「解释掉」显然不是人的候选，剩下真有可能漏的人送人工。"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = re.sub(r"\s+", "", open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"),
                              encoding="utf-8-sig").read())
CANDS = json.load(open(os.path.join(ROOT, "candidates.json"), encoding="utf-8"))
DRAFT = json.load(open(os.path.join(ROOT, "merged-draft.json"), encoding="utf-8"))

KNOWN = []
for c in DRAFT["characters"]:
    KNOWN.append(c["canonical"])
    KNOWN.extend(c["aliases"])
for col in DRAFT["collectives"]:
    KNOWN.append(col["name"])
    KNOWN.extend(col["refers_to"])
KNOWN = sorted(set(KNOWN), key=len, reverse=True)
KW = set(KNOWN)

SURNAMES = set("""姜黄姬苏邓陈郑陆袁张孔吕洪韩方余马李杨谢丁尹鈉赵王曹侯崇崔蒋窦鄂辛白柏金高窦姚孙
周武罗管伯闳太顚南宫冒于准接元燃广赤惧留普贤慈航清虚玉王丘申龟灵无当金灵火灵龙吉邓杨任法戒马善
丘引胡雷徐盖李艮敖光敖顺敖明敖吉王魔杨森李兴霸高明高觉邬文化常昊吴龙朱子真杨显戴礼金大升袁洪
辛免辛甲伯适叔夜季随白公太昊炎帝少昊颛顼轩辕伏羲神农燧人盘古陆压柏鉴丘引龙安龙吉土行孙邓秀
丘双胡洪雷鲁晁李张徐王杨尚石断_win""".split())
SURNAMES = {s for s in SURNAMES if len(s) == 1}
for k in KNOWN:  # 本书里已确认的人名的姓，作为姓氏先验
    if len(k) >= 2:
        SURNAMES.add(k[0])

PLACE = set("""西岐 朝歌 孟津 岐山 黄河 渑池 佳梦 汜水 金鸡 潼关 临潼 穿云 界牌 青龙 游魂 三山 崇城
冀州 曹州 朝歌城 五关 磻溪 羑里 陈塘 玉虚 碧游 金鳌 火云 女娲 摘星 鹿台 轩辕 黄花 芦篷 封神 台
中军 帅府 相府 周营 汤营 行营 后营 前营 大营 辕门 午门 殿前 阶下 后宫 宫门 寿仙 龙德 显庆 嘉善
分宫 摘星楼 鹿台 朝歌城 西岐城 冀州城 汜水关 金鸡岭 孟津渡 黄河渡 五路 三山 佳梦关 游魂关""".split())
ORG = ("府", "营", "殿", "宫", "楼", "台", "司", "院", "衙", "关", "城", "池", "山", "洞", "岭", "渡",
       "镇", "州", "县", "国", "朝", "堂", "亭", "阁", "观", "庙", "寺", "庵", "园", "林", "坡", "岸")
NARR = set("""只见 话说 今日 左右 二人 一声 大怒 大呼 答曰 问曰 笑曰 言曰 奏曰 诗曰 末将 如此 为何 何人
只得 上前 方才 自思 大惊 文武 百官 三军 师父 贫道 明日 故此 口称 大叫 大喜 叫曰 骂曰 奏知 启奏 孩儿
天下 世上 人间 一夜 五更 三更 黄昏 天明 平年 须臾 少顷 且说 却说 言未毕 未几 出关 进关 回营 进营
上帐 下山 上山 坐名 行礼 军士 士卒 家将 宫人 妖精 神仙 国法 关隘 乾元 白光 路上 登台 游宫 忽报 闻报
忙传 忙问 反叛 知是 知天 来见 马报 探马 报入 报与 一齐 许多 然后 奉御 军政 师伯 师命 吾师 吾乃 众人
何故 何如 何事 何必 何处 利害 相见 相还 站立 声大 只听得 说了一遍 真是 自然 相交 只因 出 内有 后面
向前 纳言 俯伏 欠身 稽首 呐喊 黄帝 父母 母亲 父亲 长兄 师兄 兄弟 东西 以正 方可 旨意 原是 方欲 许之
不得 不能 无用 无益 无二 无敌 万姓 万仙 五行 黄金 大红 都城 反为 尚不 及至 大败 大胜 得胜 成功 收兵
放炮 举火 招旗 交战 交锋 前进 退兵""".split())


JUNK = set(json.load(open(os.path.join(ROOT, "merge-v6.json"), encoding="utf-8"))["junk_forms"])
JUNK |= set("""太师 道人 天子 元帅 真人 门人 道兄 老师 大夫 大王 二将 老爷 圣母 天尊 夫人 童子
师叔 道者 贤弟 主将 君侯 师尊 公主 童儿 千岁 总兵 先生 四人 圣人 道童 使命 先行官 军政官 奉御官
中大夫 上大夫 丞相 殿下 陛下 娘娘 少爷 员外 娘子 官军 王师 小将 老兵 后生 小子 汝曹 若属 尔曹
天下诸侯 四海 东南 西北 道德 一片 一把 当日 上殿 上台 观之 相迎 施行 逆天 无不 何如 缘分 气数""")


def explained(nm, ctx):
    if nm in KW:
        return "已收录（别名归属核对中）", "名单内已有该写法"
    for k in KNOWN:
        if len(k) >= 2 and k in nm:
            return "跨名n元组", f"包含已收录写法「{k}」，是扫描切词跨界产物，提及已随「{k}」计"
    if nm in JUNK:
        return "泛称·裸职称·处所通名", "无姓氏修饰的称谓/官职/处所词，不特指某人（规则§1 不收）"
    for k in KNOWN:
        if len(nm) >= 2 and nm in k and k != nm:
            return "跨名n元组", f"是已收录写法「{k}」的截断片段，提及已随「{k}」计"
    if nm in NARR or nm in PLACE:
        return "叙述常用语·地名", "白话叙述套语或地名，非人名"
    if any(nm.endswith(w) for w in ("曰", "道", "言", "云", "思", "想", "笑", "骂", "喝", "应", "诺",
                                    "奏", "启", "毕", "了", "过", "来", "去", "入", "出", "下", "上")):
        return "叙述常用语", "以动词/语气字收尾的词组，非人名"
    if len(nm) >= 3 and nm[-1] in ORG:
        return "地名·机构", f"末字「{nm[-1]}」为处所用字"
    if any(nm.endswith(s) for s in ("剑", "刀", "鞭", "锏", "旗", "幡", "印", "珠", "镜", "塔", "圈",
                                    "绫", "桩", "斧", "镖", "钉", "书", "剪", "扇", "伞", "帕", "符",
                                    "铠", "盔", "甲", "袍", "带", "靴", "鞍", "辔", "车", "炉", "鼎",
                                    "琴", "箫", "笛", "弓", "箭", "枪", "戟", "棍", "棒", "锤", "网",
                                    "索", "钟", "鼓", "牌", "盾", "葫芦", "马", "牛", "羊", "鹿")):
        return "器物·法宝·坐骑", "名物词，非人名"
    if nm in ("成汤", "殷商", "周室", "西周", "大周", "东周", "商汤"):
        return "朝代·国名", "非人名"
    if re.fullmatch(r"[一二三四五六七八九十百千万两\d]+[路员道位名年时更班]", nm):
        return "数量词组", "数词+量词"
    return None, None


out = defaultdict(list)
review = []
for cand in CANDS:
    nm, cnt = cand["name"], cand["count"]
    if cnt < 2:
        continue
    ctx = (cand.get("contexts") or [""])[0]
    kind, why = explained(nm, ctx)
    if kind:
        out[kind].append({"candidate": nm, "count": cnt, "reason": why})
        continue
    hits = []
    for m in re.finditer(re.escape(nm), BOOK):
        seg = BOOK[max(0, m.start() - 6):m.end() + 8]
        if re.search(r"(曰|道|引|领|上|出|命|着|擒|斩|封|杀|与|战|听|怒|喜|奏|唤|讳|姓|名)", seg):
            hits.append(seg)
    looks_name = len(nm) >= 2 and nm[0] in SURNAMES and len(hits) >= 1
    review.append({"name": nm, "count": cnt, "name_like": bool(looks_name),
                   "ctx": ctx[:56], "hits": hits[:2]})

print("解释掉的候选分类：")
tot = 0
for k, v in sorted(out.items(), key=lambda x: -len(x[1])):
    print(f"  {k}: {len(v)}")
    tot += len(v)
need = [r for r in review if r["name_like"]]
print(f"\n未被名单覆盖的候选: {len(review)}  其中「像人名且有动词语境」: {len(need)}")
for r in sorted(need, key=lambda x: -x["count"])[:70]:
    print(f"  {r['name']} ×{r['count']} :: {r['hits'][0] if r['hits'] else r['ctx']}")
json.dump({"classes": out, "review_all": review, "review_name_like": need},
          open(os.path.join(ROOT, "audit-v2.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
