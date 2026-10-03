#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""对照「应当有的人物」清单检查归并稿漏人（漏的必须在原文查得到才算漏）。"""
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = re.sub(r"\s+", "", open(os.path.join(os.path.dirname(ROOT), "txt", "封神演义.txt"),
                              encoding="utf-8-sig").read())
D = json.load(open(os.path.join(ROOT, "merged-draft.json"), encoding="utf-8"))
F = set()
for c in D["characters"]:
    F.add(c["canonical"])
    F.update(c["aliases"])
PROBE = """马兆 太鸾 风林 陈庚 卞金龙 卞吉 姚中 金胜 张谦 李定 李通 孙荣 李仁 高兰英 鲧捐 萧银 黄元济
吉立 余庆 周纪 龙环 吴谦 黄明 辛甲 辛免 乙演 丘引 张山 杨凤 李锦 鲁仁杰 胡雷 徐盖 王豹 陈桐 陈梧
孙全 韩升 韩变 龙安吉 杨任 李平 吕岳 马元 周信 杨森 杨梓 法戒 马善 余化 余元 高友乾 李兴霸
王魔 张桂芳 敖光 敖丙 敖顺 敖明 敖吉 李艮 魔礼青 魔礼红 魔礼海 魔礼寿 秦完 白礼 姚宾 张绍 王变
孙良 孙显 赵江 邓秀 邓忠 土行孙 郑伦 陈奇 苏全忠 崇应彪 崇应鸾 胡升 胡敏 黄飞彪 黄飞豹
黄天禄 黄天爵 黄天祥 姬叔玉 姬叔金 姬叔升 姬叔明 窦荣 徐昌 杨春 马昌 常舒 王佐
雷开 殷破败 殷成秀 鲁雄 方弼 方相 高明 高觉 邬文化 袁洪 吴龙 常昊 朱子真 杨显 戴礼 金大升
李道通 柏鉴 黄滚 黄天化 邓婵玉 姜文焕 鄂顺 姬发 伯邑考 微子 箕子 比干 商容 赵启 梅伯 胶鬲
杜元铣 飞廉 恶来 胡喜媚 王贵人 徐坤 王吉 马良 杨思达 高元 张凤 龙须虎 华陀 龙环 吉士魁 陈庚
赵丙 黄占 乔坤 高升 沈凤 田见秀 杨梓 宛璋 吕芳 韩荣 韩升 徐盖 李锦 方道真 孙乾 王魔 杨森"""
missing = sorted(set(p for p in PROBE.split() if p not in F))
real = [(p, BOOK.count(p)) for p in missing if BOOK.count(p) > 0]
print("清单中归并稿查无:", len(missing), "；原文确实存在 → 真漏:", len(real))
for p, n in sorted(real, key=lambda x: -x[1]):
    i = BOOK.find(p)
    print(f"  {p} ×{n} :: {BOOK[max(0,i-26):i+18]}")
print("\n原文也查无（不补）:", "、".join(p for p in missing if BOOK.count(p) == 0))
