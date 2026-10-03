#!/usr/bin/env python3
"""召回审计裁决：把 candidates.json 里没被名单覆盖的候选按规则归类，剩下的送人工过目。"""
import json, os, re
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = re.sub(r"\s+", "", open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"),
                              encoding="utf-8-sig").read())
CANDS = json.load(open(os.path.join(ROOT, "candidates.json"), encoding="utf-8"))
DRAFT = json.load(open(os.path.join(ROOT, "merged-draft.json"), encoding="utf-8"))

known = []
for c in DRAFT["characters"]:
    known.append(c["canonical"])
    known.extend(c["aliases"])
for col in DRAFT["collectives"]:
    known.append(col["name"])
    known.extend(col["refers_to"])
KNOWN = set(known)


def covered(name):
    return any(name == k or name in k for k in KNOWN)


SURNAME = Counter()
for k in KNOWN:
    if len(k) >= 2:
        SURNAME[k[0]] += 1
SUR = {s for s, n in SURNAME.items() if n >= 3}

WORDS = set("""只见 话说 今日 左右 二人 一声 大怒 大呼 答曰 问曰 笑曰 言曰 奏曰 诗曰 末将 如此 为何 何人
只得 上前 方才 自思 大惊 文武 百官 三军 师父 贫道 明日 故此 口称 大叫 大喜 叫曰 骂曰 奏知 启奏 道童 左右
天下 世上 人间 一夜 五更 三更 黄昏 天明 平明 晌午 未几 不多 须臾 少顷 食时 至今 从前 当日 明日 后日
那日 此日 当时 彼时 且说 却说 话说 言未毕 话音 话言 未几 未及 未动 住手 歇马 得胜 得胜 请战 出马 交战
交锋 大胜 大败 得胜 收兵 前进 退兵 赶入 杀入 杀出 冲入 喊声 鼓声 钟声 炮声 马到 人喊 喊杀 擂鼓 鸣金
放炮 举火 招旗 令旗 军令 将令 元帅府 行营 中军 帐前 帐下 殿前 殿下 朝堂 午门 北门 东门 南门 西门 辕门
城头 城下 关下 山下 水上 空中 半空 云内 洞中 庵前 观中 庙内 寺中 府中 家中 堂上 阶下 廊下 马上 马下
步战 车战 水战 火攻 箭到 刀起 枪到 剑起 斧劈 刀砍 戟刺 搠死 砍下 剁了 诛了 斩了 擒了 拿了 放了 死了
活了 去了 来了 回去 起来 坐定 立住 停住 住了 歇了 吃了 穿了 戴了 挂了 收了 升帐 升殿 上马 下马 入城
出城 过关 住下 安营 拔寨 起程 上路 登程 到任 回朝 见驾 谢恩 叩首 俯伏 拜舞 山呼 千岁 万寿 圣寿 娘娘
国母 老长 老母 大哥 大姐 二哥 三哥 小军 小校 老兵 百姓 万民 四民 农夫 渔父 樵夫 猎人 商贾 医士 巫祝""".split())
PLACE_SUFFIX = tuple("关 山 洞 宫 殿 楼 台 池 江 河 海 岭 坡 渡 城 野 村 庄 府 营 阵 碑 峡 洲 津 镇 店 桥 涧 壑 峰 崖 石 潭 泉 井 门 巷 街 里 邑 郡 州 县 乡 田 园 陵 墓 塔 观 庙 寺 庵 堂 轩 榭 库 仓 监 司 院 衙")
THING_SUFFIX = tuple("剑 刀 鞭 锏 旗 幡 印 珠 镜 塔 圈 绫 桩 斧 镖 钉 书 剪 扇 伞 帕 符 葫芦 车 鞍 盔 甲 袍 带 靴 马 盂 杯 盏 炉 鼎 琴 箫 笛 弓 箭 枪 戟 棍 棒 锤 抓 网 索 锤 球 钟 鼓 牌 盾 杯")
DYNASTY = set("成汤 殷商 商朝 周室 西周 大周 成汤国 商汤 夏后 东鲁 南蛮 北狄 西戎 匈奴 岛夷 吾商 吾周 尔周".split())


def cls(name, cnt, ctx):
    if name in KNOWN:
        return "已收录", ""
    if name in WORDS:
        return "叙述常用语", "白话叙述/戏曲套语，非人名"
    if any(name.endswith(w) for w in ("曰", "道", "言", "云", "思", "想", "笑", "骂", "喝", "应", "诺", "奏", "启")):
        return "叙述常用语", "以说话动词收尾的词组，非人名"
    if len(name) >= 3 and any(name.endswith(s) for s in PLACE_SUFFIX):
        return "地名·关隘·宫观", "后缀为地点/机构用字"
    if len(name) >= 2 and name[-1] in PLACE_SUFFIX and (ctx and re.search(r"[到至入守过破镇扎立]$", ctx[:len(ctx)//2] or "")):
        return "地名·关隘·宫观", "上下文为抵达/镇守"
    if any(name.endswith(s) for s in THING_SUFFIX):
        return "器物·法宝·坐骑通名", "法宝/兵器/衣甲/坐骑类名物"
    if name in DYNASTY:
        return "朝代·国名", "非人名"
    if re.fullmatch(r"[一二三四五六七八九十百千万两\d]+[路员道位名年时更]", name):
        return "数词组", "数量/时序词组"
    if name[0] in SUR and len(name) >= 2:
        return "待人工", "首字为本书常见姓氏，需查上下文"
    if ctx and re.search(r"(?:那|这|众|诸|二|三|四|五|六|七|八|九|十|百|千|万|一)(?:人|名|位|般|样)", name):
        return "泛称", "指量词组"
    return "待人工", "首字不是本书姓氏，但仍需抽查"


out = defaultdict(list)
manual = []
for cand in CANDS:
    nm, cnt = cand["name"], cand["count"]
    if cnt < 2 or covered(nm):
        continue
    ctx = (cand.get("contexts") or [""])[0]
    kind, why = cls(nm, cnt, ctx)
    out[kind].append({"candidate": nm, "count": cnt, "reason": why})
    if kind == "待人工":
        manual.append((nm, cnt, ctx[:60]))

print("未覆盖候选分类：")
for k, v in sorted(out.items(), key=lambda x: -len(x[1])):
    print(f"  {k}: {len(v)} 条")
print("\n=== 待人工", len(manual), "条（按次数降序）===")
for nm, cnt, ctx in sorted(manual, key=lambda x: -x[1])[:150]:
    print(f"  {nm} ×{cnt} :: {ctx}")
json.dump({k: v for k, v in out.items()}, open(os.path.join(ROOT, "audit-classes.json"), "w",
                                               encoding="utf-8"), ensure_ascii=False, indent=1)
