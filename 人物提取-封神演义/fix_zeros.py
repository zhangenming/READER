#!/usr/bin/env python3
# 修复核验问题：
# 1) 封神榜讳名格式（姓讳名/姓　讳名）→ 补原文形式别名
# 2) 仍无法在原文找到的 → 输出人工裁决清单
# 3) 剔除单字及高危泛化别名（子串误计）
import json, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
TXT = '/Users/zem/AI/READER/txt/封神演义.txt'
text = open(TXT, encoding='utf-8-sig').read()
draft = json.load(open(os.path.join(BASE, 'merged-draft.json')))
ver = {c['canonical']: c for c in json.load(open(os.path.join(BASE, 'verification.json')))['characters']}

# 单字别名与高危短别名（会在古文里误命中普通词）
PRUNE_ALIAS = set('尚 昌 发 容 伦 宣 护 靖 齐贵 先 黑 白 飞 龙 金 木 土 火 水 荣 贵 让 寅 烨 燧 益 溥 满 启'.split())
PRUNE_ALIAS |= {'马报', '子牙曰', '说子牙'}

fixed, manual, pruned = 0, [], 0
for ch in draft['characters']:
    name = ch['canonical']
    # 3) 剔除高危别名
    before = len(ch['aliases'])
    ch['aliases'] = [a for a in ch['aliases'] if a not in PRUNE_ALIAS and not (len(a) == 1)]
    pruned += before - len(ch['aliases'])
    occ = ver.get(name, {}).get('occurrences', {})
    cn = occ.get('canonical', 0)
    if cn > 0:
        continue
    # 1) 讳名格式探测：姓 + (可选全角空格) + 讳 + (可选全角空格) + 名
    if len(name) >= 2:
        surname, given = name[0], name[1:]
        pats = [f'{surname}讳{given}', f'{surname}\u3000讳{given}', f'{surname}　讳{given}',
                f'{surname}\u3000\u3000讳{given}', f'{surname} 讳{given}']
        hit = None
        for p in pats:
            if p in text:
                hit = p
                break
        if hit:
            ch['aliases'].append(hit)
            fixed += 1
            continue
    # 2) 人工裁决
    manual.append({'canonical': name, 'aliases': ch['aliases'][:8], 'note': ch['note'][:60]})

json.dump(draft, open(os.path.join(BASE, 'merged-draft.json'), 'w'), ensure_ascii=False, indent=1)
print(f'讳名格式补别名: {fixed} 人；剔除高危别名 {pruned} 处；仍需人工裁决: {len(manual)}')
for m in manual:
    print('  ?', m['canonical'], '| alias:', m['aliases'][:5], '|', m['note'])
