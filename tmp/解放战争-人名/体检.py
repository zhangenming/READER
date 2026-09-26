# -*- coding: utf-8 -*-
"""体检：用一份手写权威人名名单测召回率；对 A/B 两层做抽样精确率检查。

用法：python3 体检.py            -> 召回 + 抽样
      python3 体检.py dump A 200  -> 打印某层名单
"""
import io
import json
import os
import random
import re
import sys

BASE = "/Users/zem/AI/READER"
D = os.path.join(BASE, "tmp", "解放战争-人名")
BOOK = os.path.join(BASE, "txt", "解放战争（套装共6册）.txt")

SEED_TEXT = """
毛泽东 周恩来 刘少奇 朱德 任弼时 张闻天 博古 王明 陈云 邓小平 高岗 饶漱石 李富春 李先念 彭真 董必武 林伯渠
谢觉哉 徐特立 吴玉章 康生 陈毅 贺龙 徐向前 聂荣臻 叶剑英 罗荣桓 刘伯承 陈赓 粟裕 徐海东 萧劲光 张云逸 林彪
叶挺 项英 曾山 谭震林 邓子恢 张鼎丞 罗瑞卿 杨尚昆 李克农 潘汉年 刘晓 刘长胜 钱之光 王若飞 邓颖超 蔡畅 李维汉
贾拓夫 陶铸 程子华 萧克 李井泉 宋任穷 陈再道 陈锡联 杨得志 杨成武 杨勇 王震 王宏坤 王建安 谢富治 韦国清 谭政
黄克诚 洪学智 刘亚楼 彭雪枫 张爱萍 韦杰 叶飞 陶勇 王必成 廖政国 何基沣 张克侠 吴化文 苏振华 李志民 徐立清
甘泗淇 宋时轮 王平 郑维山 傅崇碧 罗贵波 陈士榘 唐亮 朱良才 秦基伟 刘忠 王近山 杜义德 周希汉 陈康 尤太忠
李成芳 刘金轩 张才千 饶子琪 皮定均 陈庆先 詹才芳 李中权 欧致富 王德 胡炜 王蕴瑞 雷英夫 李治 方强 袁也烈
廖锦涛 洗恒武 梁灵光 刘其人 刘兴元 王六生 丁秋生 王集成 政治委员 政治部主任 彭林 温玉成 廖荣标 雷绍康
陈庆先 方毅 傅钟 萧华 萧望东 舒同 江渭清 钟期光 姬鹏飞 韩先楚 刘震 吴法宪 王秉璋 段苏度 陈伯钧 李达
吕正操 万毅 周保中 李兆麟 冯仲云 张寿箴 陈光 曾克林 赖传珠 孙毅 杨至成 唐延杰 邓华 李天佑 贺东生 晏福生
袁升平 邱创成 吴富善 高志荣 徐德金 左齐 罗华生 张天云 张震 张藩 余立金 王尚荣 黄玉昆 童陆生 王东保
雷英夫 陈宜 罗学通 邓华 洪学智 解方 杜平 丁甘 高参 廖政国 朱云谦 范超 张玉华 田维 张英辉
蒋介石 李宗仁 白崇禧 何应钦 陈诚 顾祝同 刘峙 杜聿明 王耀武 邱清泉 黄百韬 李弥 黄维 孙元良 胡琏 宋希濂
李默庵 张灵甫 欧震 李玉堂 范汉杰 廖耀湘 郑洞国 潘朔端 曾泽生 卢汉 龙云 刘文辉 邓锡侯 潘文华 孙连仲 高树勋
马法五 卫立煌 罗卓英 关麟征 汤恩伯 王仲廉 李仙洲 周至柔 王叔铭 毛邦初 俞大维 翁文灏 孙科 居正 戴季陶
于右任 张群 吴鼎昌 莫德惠 王云五 俞鸿钧 张笃伦 朱绍良 余汉谋 张发奎 薛岳 余程万 方先觉 夏楚中 李延年
程潜 陈明仁 陶峙岳 董其武 傅作义 邓宝珊 马鸿逵 马鸿宾 马步芳 马继援 韩德勤 孙良诚 田君健 郝鹏举 孙殿英
庞炳勋 王凌云 张淦 张轸 杨干才 鲁道源 徐远举 毛人凤 戴笠 郑介民 唐纵 邓文仪 康泽 胡宗南 李文 罗列
盛文 钟彬 宋瑞珂 覃师 王敬久 王铁汉 石觉 阙汉骞 陈_fid 赵国屏 王理寰 周福成 向凤武 黄翔 何文鼎 李九思
沈金波 廖敬安 潘裕昆 刘嘉 张古愚 唐云山 丘汉城 王禹 韦伯乐 刘玉章 郑廷珍 李和音 袁珂 郭景云 滇 卢浚泉
杨超 赵锡田 张嘉陶 陈式正 王铁英 瞿吴 田军 康宁 关仁 李忍 李九 陈金 程家 刘登 远南 谭知 张琴 孙震
唐式遵 王泽 潘左 陈离 方影 顾晓同 何文鼎 朱光祖 田君 王元 俞建 康庄
宋庆龄 李济深 何香凝 张澜 黄炎培 沈钧儒 陈铭枢 郭沫若 马叙伦 马寅初 谭平山 邵力子 颜惠庆 章士钊 李书城
柳亚子 茅盾 巴金 曹禺 田汉 梅兰芳 齐白石 徐悲鸿 陶行知 邹韬奋 史良 邓初民 陈嘉庚 司徒美堂 张东荪 罗隆基
章伯钧 彭泽民 陈绍宽 蔡廷锴 蒋光鼐 区寿年 杨杰 熊克武 但懋辛 王缵绪 王陵基 杨森 孙震 吴铁城 陈立夫
陈果夫 孔祥熙 宋子文 蒋经国 蒋纬国 阎锡山 冯玉祥 司徒雷登 马歇尔 赫尔利 魏德迈 杜鲁门 艾奇逊 马立官
孙致义 白鲁德 崔可夫 罗申 契斯恰科夫 科瓦廖夫 斯大林 莫洛托夫 伏罗希洛夫 朱可夫 雅科夫 冈村宁次 今井武夫
小林浅三郎 东条英机 杉山元 植田谦吉 本庄繁 梅津美治郎 南次郎 阿南惟几 山下奉文 畑俊六 冈部直三郎 麦克阿瑟
丘吉尔 艾德礼 艾登 斯特朗 史沫特莱 马海德 陈纳德 白修德 柯勒士 佐藤 葛量洪 联总 魏德 安井 前田 今村
藤村 大西 栗林 田中 隆吉 武藤 章乃器 胡子昂 吴羹梅 _CB 陈云菲 邓发 刘宁一 马鸿宾 郭永 李Digest 张克 希
李烛尘 朱学范 陈叔亮 沈志远 许德 珩 张炯 李相符 陈此生 李任仁 杨玉 陈翰笙 陈家康 龚饮冰 廖承志 刘格平
张执一 吴茂荪 邢西 郑法 刘思 慕 宋源 程声明 王一 真 江清 邓初 光 张松 斋 周谷 唐 周谷 超 苏步 谷 超
李坊 应 德 超 李达 章申 秋 宗白华 林超 储安平 赵超构 任美 谢 家镛 徐铸成 赵超 金忠 村 松 一 王芸 生
"""
text = io.open(BOOK, encoding="utf-8").read()
seeds = sorted({w for w in re.split(r"\s+", SEED_TEXT) if 2 <= len(w) <= 6 and re.match(r"^[一-鿿]+$", w)})

if 0 and len(sys.argv) > 2 and sys.argv[1] == "dump":
    d = json.load(io.open(os.path.join(D, "names3.json"), encoding="utf-8"))
    tier = sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 400
    items = sorted(d[tier].items(), key=lambda kv: -kv[1]["s"])
    print("  ".join(k for k, _ in items[:n]))
    sys.exit()

merged = {}
d = json.load(io.open(os.path.join(D, "人名-终校.json"), encoding="utf-8"))
merged = {k: "AB" for k in d["names"]}
merged.update({k: "C" for k in d["C1"]})
# 探针名单里混着一些不是人名的词（职务名、被空格切断的半截姓名等），核算召回时先剔除
NOT_A_NAME = set("政治委员 政治部主任 大西 张克 陈金 刘嘉 王泽 魏德 王一 王元 李九 杨玉 任美 郭永 高参 联总 邓初 覃师 程家 赵超 远南 陈宜 李治 田君 飞虎 新六军 王理 康庄 白昼 鹿砦 南北宽 更待 何正 参谋长 司令员 军长 师长 政治部".split())
present = [(w, text.count(w)) for w in seeds if text.count(w) > 0 and w not in NOT_A_NAME]
found = [(w, h, merged[w]) for w, h in present if w in merged]
missed = [(w, h) for w, h in present if w not in merged]
print("权威名单 %d；文中出现 %d；抓到 %d（A层 %d / B层 %d / C层 %d）；漏 %d"
      % (len(seeds), len(present), len(found),
         len([x for x in found if x[2]=="AB"]), 0,
         len([x for x in found if x[2]=="C"]), len(missed)))
print("召回 = %.1f%%（C 层视为未抓到）" % (100.0 * len([x for x in found if x[2]=="AB"]) / len(present)))
print("\n=== 漏单 ===")
for w, h in sorted(missed, key=lambda x: -x[1])[:45]:
    m = re.search(r".{0,18}%s.{0,16}" % re.escape(w), text)
    print("%-6s%-5d %s" % (w, h, m.group(0).replace("\n", "⏎") if m else ""))
print("\n=== A/B 层随机抽样（人工判读精确率）===")
random.seed(11)
for t in ("names", "names"):
    ks = sorted(d[t], key=lambda k: -d[t][k]["s"])
    samp = random.sample(ks, min(45, len(ks)))
    print("--- 层 %s 共 %d ---" % (t, len(d[t])))
    for k in samp:
        m = re.search(r".{0,14}%s.{0,14}" % re.escape(k), text)
        print("%-7s s=%-4d %s" % (k, d[t][k]["s"], m.group(0).replace("\n", "⏎") if m else ""))
