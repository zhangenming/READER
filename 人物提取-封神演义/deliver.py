#!/usr/bin/env python3
# 交付物生成：人物名单.md + characters.json + 人名导入.txt
import json, os
from collections import Counter

BASE = os.path.dirname(os.path.abspath(__file__))
draft = json.load(open(os.path.join(BASE, 'merged-draft.json')))
ver = {c['canonical']: c for c in json.load(open(os.path.join(BASE, 'verification.json')))['characters']}

# ---- 回填出现次数，重新分级 ----
chars = []
for c in draft['characters']:
    v = ver.get(c['canonical'], {})
    occ = v.get('occurrences', {})
    cn = occ.get('canonical', 0)
    if 'canonical_count_fix' in c:
        cn = c['canonical_count_fix']
    al = dict(occ.get('aliases') or {})
    for k, corr in (c.get('alias_count_fix') or {}).items():
        if k in al:
            al[k] = corr
    total = cn + sum(al.values())
    if total >= 400:
        imp = '主角'
    elif total >= 100:
        imp = '重要配角'
    elif total >= 10:
        imp = '次要人物'
    else:
        imp = '仅提及'
    chars.append({
        'canonical': c['canonical'], 'aliases': c['aliases'], 'importance': imp,
        'identity': c['identity'], 'nonhuman': c['nonhuman'],
        'mentioned_only': c['mentioned_only'], 'first_seen_pct': c['first_seen_pct'],
        'note': c['note'], 'occurrences': {'canonical': cn, 'aliases': al, 'total': total},
    })
chars.sort(key=lambda x: -x['occurrences']['total'])

# ---- 合称整理 ----
CURATED = [
 ('魔家四将（四大天王）', '魔礼青、魔礼红、魔礼海、魔礼寿', 8),
 ('金、木二吒', '金吒、木吒', 15),
 ('三妖（轩辕坟三妖）', '妲己（九尾狐狸精）、胡喜媚（九头雉鸡精）、王贵人（玉石琵琶精）', 5),
 ('黄家父子', '黄飞虎及其子黄天禄、黄天爵、黄天祥、黄天化', 7),
 ('四贤八俊', '西岐贤臣：散宜生、南宫适、太颠、闳夭、辛甲、辛免、祁恭、尹籍等', 7),
 ('费尤', '费仲、尤浑', 5),
 ('邓、辛、张、陶四将', '邓忠、辛环、张节、陶荣（闻太师部将）', 6),
 ('金鳌岛十天君', '秦完、赵江、董全、袁角、金光圣母、孙良、白礼、姚斌、王变、张绍', 4),
 ('三位娘娘（三仙姑、坑三姑娘）', '云霄、琼霄、碧霄', 6),
 ('梅山七怪（七圣）', '袁洪、吴龙、常昊、朱子真、杨显、戴礼、金大升', 5),
 ('九龙岛四圣（灵霄殿四将）', '王魔、杨森、高友乾、李兴霸', 4),
 ('四海龙王', '敖光、敖顺、敖明、敖吉（本书写法）', 2),
 ('哼哈二将', '郑伦、陈奇', 2),
 ('殷、雷二将', '殷破败、雷开', 4),
 ('方家兄弟', '方弼、方相', 2),
 ('晁田兄弟', '晁田、晁雷', 1),
 ('四镇（四大）诸侯', '东伯侯姜桓楚、南伯侯鄂崇禹、西伯侯姬昌、北伯侯崇侯虎', 3),
 ('二位殿下', '殷郊、殷洪', 3),
 ('昆仑十二代弟子（玉虚十二仙）', '广成子、赤精子、太乙真人、玉鼎真人、惧留孙、文殊广法天尊、普贤真人、慈航道人、黄龙真人、道行天尊、清虚道德真君、灵宝大法师', 4),
 ('三位教主', '老子、元始天尊、通天教主', 1),
 ('四位教主', '老子、元始天尊、通天教主、接引道人（准提道人）', 1),
 ('西方二位教主', '接引道人、准提道人', 1),
 ('三大士（三大师）', '文殊广法天尊、普贤真人、慈航道人', 2),
 ('截教上四代弟子', '多宝道人、金灵圣母、无当圣母（一处作武当圣母）、龟灵圣母', 1),
 ('余化龙父子（兄弟五人）', '余化龙及其子余达、余兆、余光、余先、余德', 3),
 ('苏护父子（苏家父子）', '苏护、苏全忠', 3),
 ('韩荣父子三人', '韩荣、韩升、韩变', 2),
 ('邓芮二侯', '邓昆、芮吉', 2),
 ('崇侯虎父子', '崇侯虎、崇应彪', 1),
 ('夷齐', '伯夷、叔齐', 1),
 ('二丞相（二相）', '商容、比干', 2),
 ('二贵妃', '黄贵妃、杨贵妃', 1),
 ('殷有三仁', '微子、箕子、比干', 1),
 ('列位皇伯', '微子、微子启、微子衍、比干、箕子', 1),
 ('周有三母', '太姜、太姙、太姬', 1),
 ('神荼、郁垒（桃精柳鬼）', '高明、高觉', 2),
 ('三运官', '杨戬、土行孙、郑伦（督粮运草三官）', 1),
 ('七位门人', '李靖、金吒、木吒、哪吒、杨戬、雷震子、韦护', 2),
 ('火云洞三圣（三圣）', '伏羲、神农、轩辕', 2),
 ('三皇', '伏羲、神农、轩辕', 1),
 ('五帝', '少昊、颛顼、帝喾、尧、舜', 1),
 ('二叔（管蔡）', '管叔鲜、蔡叔度', 1),
 ('二虢', '虢仲、虢叔', 1),
 ('二位先行官', '王佐、郑桩', 1),
 ('三贤士', '丁策、董忠、郭宸', 1),
 ('三路诸侯', '姜文焕、崇应鸾、鄂顺', 1),
 ('洪锦夫妇', '洪锦、龙吉公主', 1),
 ('土行孙夫妻', '土行孙、邓婵玉', 1),
 ('五岳（五岳正神）', '黄飞虎（东）、崇黑虎（南）、闻聘/文聘（中/西，书中前后不一）、崔英、蒋雄', 3),
 # 封神榜编制（成员见名单"仅提及"区）
 ('八部正神', '雷、火、瘟、斗等八部三百六十五位正神之统称', 2),
 ('雷部二十四位天君正神', '邓忠、辛环、张节、陶荣、庞弘、刘甫、苟章、毕环、秦完、赵江、董全、袁角、李德、孙良、白礼、黄庚、金素、吉立、余庆、姚斌、王变、张绍等', 1),
 ('随斗部三十六天罡、七十二地煞', '高衍（天魁星）、陈继真（地魁星）等一百零八位', 1),
 ('五斗群星吉曜恶煞正神', '东、西、南、北、中五斗星君及群星', 1),
 ('五路神', '子牙于宋家庄收服之五路神（个体未具名）', 3),
 ('黄巾力士', '仙家差役之泛称，无个体名单', 42),
 ('三千乌鸦兵', '郑伦所部兵卒', 1),
 ('十洲三岛仙众', '泛称', 1),
 ('三教圣人', '老子、元始天尊、通天教主（及其门下）', 1),
 ('十乱', '古称周初十位辅臣（本书引述）', 1),
]
draft["collectives_curated"] = [{'name': n, 'refers_to': r, 'count': c} for n, r, c in CURATED]

# ---- characters.json ----
out_json = {
    'book': '封神演义',
    'source': 'txt/封神演义.txt（612,671字，66分块，双通道提取+脚本核验）',
    'count': len(chars),
    'total_mentions': sum(c['occurrences']['total'] for c in chars),
    'characters': chars,
    'collectives': draft["collectives_curated"],
    'collectives_raw_count': len(draft["collectives"]),
    'filtered': draft['filtered'],
}
json.dump(out_json, open(os.path.join(BASE, 'characters.json'), 'w'), ensure_ascii=False, indent=1)

# ---- 人名导入.txt ----
with open(os.path.join(BASE, '人名导入.txt'), 'w') as f:
    for c in chars:
        f.write(c['canonical'] + '\n')

# ---- 统计 ----
totals = [c['occurrences']['total'] for c in chars]
n100 = sum(1 for t in totals if t >= 100)
n10 = sum(1 for t in totals if 10 <= t < 100)
n1 = sum(1 for t in totals if t < 3)
n3 = sum(1 for t in totals if 3 <= t < 10)
majors = [c for c in chars if c['importance'] == '主角']
seconds = [c for c in chars if c['importance'] == '重要配角']
minors = [c for c in chars if c['importance'] == '次要人物']
mentions = [c for c in chars if c['importance'] == '仅提及']
nonh = [c for c in chars if c['nonhuman']]

# ---- 人物名单.md ----
L = []
L.append('# 《封神演义》人物全清单\n')
L.append('数据源：`txt/封神演义.txt` —— 全书约 61.3 万字 / 分块 66 块 / 编码 UTF-8。'
         '提取方式：逐块精读（66 块全扫）+ 脚本候选扫描兜底 + 原文逐字核验。\n')
L.append('## 一眼看全\n')
L.append(f'| 收录人物 | 提及总数 | ≥100次 | ≥10次 | 3—9次 | 仅1—2次 | 合称 |\n|---|---|---|---|---|---|---|')
L.append(f'| {len(chars)} | {sum(totals):,} | {n100} | {n10} | {n3} | {n1} | {len(CURATED)} |\n')
L.append('## 提及最多的 30 人\n')
L.append('、'.join(f"{c['canonical']}({c['occurrences']['total']})" for c in chars[:30]) + '\n')
L.append('（括号内为提及次数；姜子牙的「子牙」、闻仲的「闻太师」等别名另计，详见 characters.json）\n')

def row(c):
    al = '、'.join(c['aliases'][:6]) + ('…' if len(c['aliases']) > 6 else '') if c['aliases'] else '—'
    pct = f"全书 {c['first_seen_pct']*100:.0f}% 处" if c['first_seen_pct'] else '开篇'
    fs = '仅提及' if c['mentioned_only'] else pct
    extra = f"<br>〔{c['note'][:40]}〕" if c['note'] else ''
    return f"| **{c['canonical']}** | {c['occurrences']['total']} | {al} | {c['identity']}{extra} | {fs} |"

def table(lst, title, desc=''):
    L.append(f'## {title}\n')
    if desc:
        L.append(desc + '\n')
    L.append('| 姓名 | 提及 | 主要别名 | 身份 | 首见 |\n|---|---|---|---|---|')
    for c in lst:
        L.append(row(c))
    L.append('')

table(majors, '主角（核心人物，≥400 次）', '按提及次数降序。姜子牙以「子牙」行世（该叫法 2,900+ 次），表中计主名与别名的合计。')
table(seconds, '重要配角（100—399 次）')
table(minors, '次要人物（10—99 次）')

# 仅提及/低频：分组紧凑列出
L.append('## 仅提及与零星出场（≤9 次）\n')
g1 = [c for c in mentions if '星' in c['identity'] or '正神' in c['identity'] or '讳' in c['note'] or c['canonical'] in ver and any('讳' in a for a in [c['canonical']])]
# 按类别关键词分组
def classify(c):
    i = c['identity'] + c['note'] + c['canonical']
    if c['canonical'] in ('伏羲','神农','轩辕','女娲娘娘','昊天上帝','瑶池金母','少昊','颛顼','帝喾','尧','舜','禹','桀','成汤','帝乙','盘古','燧人氏','有巢','太皞','共工氏','仓颉','苍颉','风后','常桑','老彭','傅说','伊尹','关龙逢','妹喜','简狄','契','后稷','公刘','亶父','王季','太王','泰伯','仲雍','尧帝','太甲','沃丁','太庚','小甲','雍己','太戊','仲丁','外壬','河亶甲','祖乙','祖辛','沃甲','祖丁','南庚','阳甲','盘庚','小辛','小乙','武丁','祖庚','祖甲','廪辛','庚丁','武乙','太丁','天皇氏','平灵王','太昊','颛帝','叔许','夏禹王'):
        return 'holy'
    if any(k in i for k in ('封神', '星官', '正神', '天君', '星"')) or c['note'].startswith('封神榜'):
        return 'gods'
    if any(k in i for k in ('姬叔', '管叔', '蔡叔', '康叔', '伯禽', '唐叔', '分封', '诸侯之', '文王之', '周公')):
        return 'zhou'
    return 'misc'
groups = {'holy': [], 'gods': [], 'zhou': [], 'misc': []}
for c in mentions:
    groups[classify(c)].append(c)
L.append('### 封神榜群神（榜上有名，书中多为提名即封）\n')
L.append('、'.join(f"{c['canonical']}({c['occurrences']['total']})" for c in groups['gods']) + '\n')
L.append('> 注：封神榜名单原文为「姓讳名」格式（如「武讳衍公」「李讳丙」），名单以人名行文，计数走天君/星名等别名；连续字串计数为 0 属正常。\n')
L.append('### 上古圣王与殷周世系（仅见于引述、世系）\n')
L.append('、'.join(f"{c['canonical']}({c['occurrences']['total']})" for c in groups['holy']) + '\n')
L.append('### 周初分封与宗族\n')
L.append('、'.join(f"{c['canonical']}({c['occurrences']['total']})" for c in groups['zhou']) + '\n')
L.append('### 其余零星人物\n')
L.append('、'.join(f"{c['canonical']}({c['occurrences']['total']})" for c in groups['misc']) + '\n')

L.append('## 合称（指代多人，不并入个人）\n')
L.append('| 合称 | 指代 | 见于 |\n|---|---|---|')
for n, r, c in CURATED:
    L.append(f'| {n} | {r} | {c} 处 |')
L.append('')

L.append('## 有名字的神兽、坐骑与精怪\n')
L.append('| 名称 | 提及 | 身份 |\n|---|---|---|')
for c in nonh:
    L.append(f"| {c['canonical']} | {c['occurrences']['total']} | {c['identity']} |")
L.append('')

L.append('## 附录：过滤记录（存疑待核，过滤≠删除）\n')
L.append('| 候选 | 过滤理由 |\n|---|---|')
for f in draft['filtered']:
    L.append(f"| {f['candidate']} | {f['reason']} |")
L.append('')

L.append('''## 统计口径
- 提及＝该叫法作为完整字符串在全书出现的次数；别名各算各的，不并入 canonical（「闻太师」不计入「闻仲」）；别名与全名的重叠部分已由核验脚本扣除。
- 分级按别名合计的提及次数划分：主角 ≥400；重要配角 100—399；次要人物 10—99；仅提及 ≤9（其中 1—2 次者 N1 处）。
- 身份＝原书上下文的一句概括，只反映本书写法；首见＝名字首次出现的大致位置（百分比），由分块索引推算。
- 封神榜名单原文作「姓讳名」（如「李天君　讳德」），此类 155 人以人名为条目、以榜文原式为别名计数；「李吉」原文拆写作「姓李，名吉」，无连续字串。
- 过滤≠删除：全部存疑候选保留在附录，可翻案。脚本候选共 9,086 条，未覆盖候选 4,168 条已逐类裁决（均为句法碎片/泛称/地名，无漏网人名）。
- 本清单与另一并行会话的中间产物共用了分块目录，66 块精读记录均经原文逐字校验后合并。'''.replace('N1', str(n1)))

open(os.path.join(BASE, '人物名单.md'), 'w').write('\n'.join(L))
print(f'人物名单.md 完成：{len(chars)} 人（主角{len(majors)}/重要配角{len(seconds)}/次要{len(minors)}/仅提及{len(mentions)}，nonhuman {len(nonh)}）')
print(f'≥100:{n100} 10-99:{n10} 3-9:{n3} 1-2:{n1}')
