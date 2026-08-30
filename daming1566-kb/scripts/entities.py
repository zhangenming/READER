# -*- coding: utf-8 -*-
"""《大明王朝1566》实体词典。

参照 baojie/shiji-kb 的实体标注体系，按本书语境精简为 9 类：
  person   人物
  place    地点（含宫殿、王府）
  org      机构衙署
  office   官职身份
  time     时间（正则提取，不进词典）
  quantity 钱粮数额（正则提取）
  book     典籍文书（《……》正则提取）
  concept  国策思想
  tribe    族群

每条: canonical -> dict(category, note, aliases=[...])
词典别名会映射回 canonical，页内高亮与实体页锚点均以 canonical 为准。
"""

ENTITIES = {
    # ---------------- 人物 ----------------
    "嘉靖": {"cat": "person", "note": "明世宗朱厚熜。二十余年不上朝，居西苑修玄，大权独揽",
             "aliases": ["嘉靖帝", "嘉靖皇帝", "世宗", "朱厚熜"]},
    "严嵩": {"cat": "person", "note": "内阁首辅，严党之首，贪而不昏",
             "aliases": ["严阁老"]},
    "严世蕃": {"cat": "person", "note": "严嵩独子，人称“小阁老”，兼领工部、吏部",
               "aliases": ["小阁老", "世蕃"]},
    "徐阶": {"cat": "person", "note": "内阁次辅，清流的定盘星",
             "aliases": ["徐阁老"]},
    "高拱": {"cat": "person", "note": "户部堂官，裕王师傅，性刚烈",
             "aliases": ["高肃卿", "肃卿"]},
    "张居正": {"cat": "person", "note": "兵部堂官，裕王侍读，雄才大略",
               "aliases": ["太岳"]},
    "吕芳": {"cat": "person", "note": "司礼监掌印太监，内廷尊称“老祖宗”",
             "aliases": ["老祖宗", "吕公公"]},
    "陈洪": {"cat": "person", "note": "司礼监首席秉笔太监，狠辣善迎", "aliases": ["陈公公"]},
    "黄锦": {"cat": "person", "note": "司礼监秉笔太监，嘉靖贴身近侍", "aliases": ["黄公公"]},
    "冯保": {"cat": "person", "note": "东厂提督太监，因打死周云逸被贬往裕王府做皇孙大伴",
             "aliases": ["冯公公"]},
    "杨金水": {"cat": "person", "note": "江南织造局兼浙江市舶司总管太监，吕芳干儿子",
               "aliases": ["杨公公"]},
    "胡宗宪": {"cat": "person", "note": "浙直总督兼浙江巡抚，严嵩门生，东南柱石",
               "aliases": ["胡部堂", "胡汝贞", "胡总督"]},
    "郑泌昌": {"cat": "person", "note": "浙江布政使，后升浙江巡抚", "aliases": []},
    "何茂才": {"cat": "person", "note": "浙江按察使，严党干将", "aliases": []},
    "马宁远": {"cat": "person", "note": "杭州知府，踏苗毁堤的执行者", "aliases": ["马知府"]},
    "常伯熙": {"cat": "person", "note": "淳安知县", "aliases": []},
    "张知良": {"cat": "person", "note": "建德知县", "aliases": []},
    "戚继光": {"cat": "person", "note": "浙江总兵，戚家军统帅，抗倭名将",
               "aliases": ["戚将军"]},
    "谭纶": {"cat": "person", "note": "裕王府詹事、浙直总督署参军", "aliases": ["谭子理", "子理"]},
    "裕王": {"cat": "person", "note": "皇储朱载垕，清流所望，后继位为隆庆帝",
             "aliases": ["朱载垕", "裕王爷"]},
    "李妃": {"cat": "person", "note": "裕王妃，诞下世子", "aliases": ["裕王妃"]},
    "世子": {"cat": "person", "note": "裕王长子朱翊钧，即后来的万历帝", "aliases": []},
    "海瑞": {"cat": "person", "note": "字刚峰。淳安知县→户部主事，上《治安疏》直谏",
             "aliases": ["海刚峰", "刚峰", "海大人", "海知县", "海主事"]},
    "海母": {"cat": "person", "note": "海瑞之母，海家规矩的执掌者", "aliases": []},
    "海妻": {"cat": "person", "note": "海瑞之妻", "aliases": []},
    "王用汲": {"cat": "person", "note": "建德知县，海瑞挚友", "aliases": []},
    "齐大柱": {"cat": "person", "note": "淳安桑农，后投戚家军，终入锦衣卫", "aliases": []},
    "田有禄": {"cat": "person", "note": "淳安县丞", "aliases": []},
    "沈一石": {"cat": "person", "note": "江南首富，织造局白手套，账册藏杀机", "aliases": []},
    "芸娘": {"cat": "person", "note": "沈一石的红颜，后随高翰文", "aliases": []},
    "高翰文": {"cat": "person", "note": "翰林院编修出身的杭州知府，始提“以改兼赈”", "aliases": []},
    "周云逸": {"cat": "person", "note": "钦天监监正，因直言上天示警被廷杖打死", "aliases": []},
    "李时珍": {"cat": "person", "note": "一代神医，胡宗宪故人", "aliases": []},
    "赵贞吉": {"cat": "person", "note": "应天巡抚，理学名臣，后入阁", "aliases": []},
    "鄢懋卿": {"cat": "person", "note": "刑部侍郎，严党干将，奉旨巡盐", "aliases": []},
    "罗龙文": {"cat": "person", "note": "通政司通政使，严世蕃心腹", "aliases": []},
    "朱七": {"cat": "person", "note": "锦衣卫头目", "aliases": []},
    "蒋千户": {"cat": "person", "note": "锦衣卫千户", "aliases": []},
    "徐千户": {"cat": "person", "note": "锦衣卫千户", "aliases": []},
    "王直": {"cat": "person", "note": "倭寇首领", "aliases": []},
    "俺答": {"cat": "person", "note": "蒙古鞑靼首领，屡犯北边", "aliases": []},
    "俞大猷": {"cat": "person", "note": "抗倭名将", "aliases": []},
    "蓝道行": {"cat": "person", "note": "朝天观观主，西苑扶乩道士", "aliases": []},

    # ---------------- 地点 ----------------
    "北京": {"cat": "place", "note": "京师", "aliases": []},
    "京师": {"cat": "place", "note": "", "aliases": []},
    "南京": {"cat": "place", "note": "", "aliases": []},
    "应天": {"cat": "place", "note": "南直隶要地，赵贞吉辖境", "aliases": []},
    "苏州": {"cat": "place", "note": "", "aliases": []},
    "杭州": {"cat": "place", "note": "浙江省城", "aliases": []},
    "淳安": {"cat": "place", "note": "浙江严州府属县，“改稻为桑”风暴眼", "aliases": ["淳安县"]},
    "建德": {"cat": "place", "note": "与淳安同属严州府，滨新安江", "aliases": ["建德县"]},
    "绍兴": {"cat": "place", "note": "", "aliases": []},
    "台州": {"cat": "place", "note": "", "aliases": []},
    "新安江": {"cat": "place", "note": "钱塘江上游，“毁堤淹田”之地", "aliases": []},
    "白茆河": {"cat": "place", "note": "", "aliases": []},
    "吴淞江": {"cat": "place", "note": "", "aliases": []},
    "浙江": {"cat": "place", "note": "", "aliases": []},
    "江南": {"cat": "place", "note": "", "aliases": ["江浙"]},
    "直隶": {"cat": "place", "note": "", "aliases": ["北直隶"]},
    "山东": {"cat": "place", "note": "", "aliases": []},
    "山西": {"cat": "place", "note": "", "aliases": []},
    "河南": {"cat": "place", "note": "", "aliases": []},
    "陕西": {"cat": "place", "note": "", "aliases": []},
    "贵州": {"cat": "place", "note": "", "aliases": []},
    "云南": {"cat": "place", "note": "", "aliases": []},
    "四川": {"cat": "place", "note": "", "aliases": []},
    "江西": {"cat": "place", "note": "", "aliases": []},
    "福建": {"cat": "place", "note": "", "aliases": []},
    "广东": {"cat": "place", "note": "", "aliases": []},
    "湖广": {"cat": "place", "note": "", "aliases": []},
    "云贵": {"cat": "place", "note": "", "aliases": []},
    "西洋": {"cat": "place", "note": "", "aliases": []},
    "波斯": {"cat": "place", "note": "", "aliases": []},
    "印度": {"cat": "place", "note": "", "aliases": []},
    "南洋": {"cat": "place", "note": "", "aliases": []},
    "宣府": {"cat": "place", "note": "北边军事重镇", "aliases": []},
    "西苑": {"cat": "place", "note": "皇城西内，嘉靖修玄之所", "aliases": []},
    "紫禁城": {"cat": "place", "note": "", "aliases": []},
    "大内": {"cat": "place", "note": "", "aliases": []},
    "玉熙宫": {"cat": "place", "note": "嘉靖帝迁居西苑后的寝宫", "aliases": []},
    "万寿宫": {"cat": "place", "note": "被大火焚毁的宫殿", "aliases": []},
    "谨身精舍": {"cat": "place", "note": "玉熙宫内嘉靖的丹房居所", "aliases": []},
    "午门": {"cat": "place", "note": "周云逸受廷杖处", "aliases": []},
    "朝天观": {"cat": "place", "note": "蓝道行所在的道观", "aliases": []},
    "裕王府": {"cat": "place", "note": "皇储裕王的王府", "aliases": []},
    "总督衙门": {"cat": "place", "note": "浙直总督署", "aliases": ["总督署"]},

    # ---------------- 机构 ----------------
    "大明": {"cat": "org", "note": "国号", "aliases": ["大明朝"]},
    "内阁": {"cat": "org", "note": "辅政机构，票拟之所", "aliases": []},
    "司礼监": {"cat": "org", "note": "内廷首席衙门，代皇帝批红", "aliases": []},
    "东厂": {"cat": "org", "note": "特务机构，冯保曾提督", "aliases": []},
    "锦衣卫": {"cat": "org", "note": "皇帝亲军兼特务机构", "aliases": []},
    "北镇抚司": {"cat": "org", "note": "锦衣卫诏狱所在", "aliases": []},
    "江南织造局": {"cat": "org", "note": "内廷派驻浙江的织造衙门，杨金水总管", "aliases": []},
    "织造局": {"cat": "org", "note": "", "aliases": []},
    "市舶司": {"cat": "org", "note": "管理海外贸易的衙门", "aliases": []},
    "国库": {"cat": "org", "note": "", "aliases": []},
    "户部": {"cat": "org", "note": "", "aliases": []},
    "兵部": {"cat": "org", "note": "", "aliases": []},
    "工部": {"cat": "org", "note": "", "aliases": []},
    "吏部": {"cat": "org", "note": "", "aliases": []},
    "礼部": {"cat": "org", "note": "", "aliases": []},
    "刑部": {"cat": "org", "note": "", "aliases": []},
    "都察院": {"cat": "org", "note": "", "aliases": []},
    "翰林院": {"cat": "org", "note": "", "aliases": []},
    "钦天监": {"cat": "org", "note": "观天象、定时宪的衙门", "aliases": []},
    "通政司": {"cat": "org", "note": "收转内外奏章的衙门", "aliases": []},
    "詹事府": {"cat": "org", "note": "", "aliases": []},
    "敬事房": {"cat": "org", "note": "", "aliases": []},
    "六部": {"cat": "org", "note": "", "aliases": []},

    # ---------------- 官职 ----------------
    "浙直总督": {"cat": "office", "note": "总督浙直军务", "aliases": []},
    "首辅": {"cat": "office", "note": "内阁之首", "aliases": []},
    "次辅": {"cat": "office", "note": "", "aliases": []},
    "阁老": {"cat": "office", "note": "对大学士的尊称", "aliases": []},
    "掌印太监": {"cat": "office", "note": "司礼监之首", "aliases": []},
    "秉笔太监": {"cat": "office", "note": "", "aliases": []},
    "提督太监": {"cat": "office", "note": "", "aliases": []},
    "提刑太监": {"cat": "office", "note": "", "aliases": []},
    "总管太监": {"cat": "office", "note": "", "aliases": []},
    "大学士": {"cat": "office", "note": "", "aliases": []},
    "堂官": {"cat": "office", "note": "部院主官的统称", "aliases": []},
    "部堂": {"cat": "office", "note": "对总督的尊称", "aliases": ["部堂大人"]},
    "尚书": {"cat": "office", "note": "", "aliases": []},
    "侍郎": {"cat": "office", "note": "", "aliases": []},
    "御史": {"cat": "office", "note": "", "aliases": []},
    "巡抚": {"cat": "office", "note": "", "aliases": []},
    "总督": {"cat": "office", "note": "", "aliases": []},
    "布政使": {"cat": "office", "note": "", "aliases": []},
    "按察使": {"cat": "office", "note": "", "aliases": []},
    "知府": {"cat": "office", "note": "", "aliases": []},
    "知县": {"cat": "office", "note": "", "aliases": []},
    "县丞": {"cat": "office", "note": "", "aliases": []},
    "主事": {"cat": "office", "note": "", "aliases": []},
    "编修": {"cat": "office", "note": "", "aliases": []},
    "侍读": {"cat": "office", "note": "", "aliases": []},
    "詹事": {"cat": "office", "note": "", "aliases": []},
    "参军": {"cat": "office", "note": "", "aliases": []},
    "参将": {"cat": "office", "note": "", "aliases": []},
    "总兵": {"cat": "office", "note": "", "aliases": []},
    "千户": {"cat": "office", "note": "", "aliases": []},
    "监正": {"cat": "office", "note": "钦天监长官", "aliases": []},
    "钦差": {"cat": "office", "note": "", "aliases": []},

    # ---------------- 国策思想 ----------------
    "改稻为桑": {"cat": "concept", "note": "全书主线国策：改浙江稻田为桑田，多产丝绸补亏空", "aliases": []},

    # ---------------- 族群 ----------------
    "倭寇": {"cat": "tribe", "note": "侵扰东南沿海的海盗集团", "aliases": []},
}

# 类别 -> 标注符号（chapter_md/tagged.md 用，仿 shiji-kb 的 〖@…〗 体例）
MARKERS = {
    "person": "@",   # 人物
    "place": "=",    # 地点
    "org": "※",     # 机构
    "office": ";",   # 官职
    "time": "%",     # 时间
    "quantity": "$",  # 钱粮数额
    "book": "#",     # 典籍
    "concept": "^",  # 国策思想
    "tribe": "◆",    # 族群
}

CATEGORY_LABELS = {
    "person": "人物",
    "place": "地点",
    "org": "机构",
    "office": "官职",
    "time": "时间",
    "quantity": "钱粮",
    "book": "典籍",
    "concept": "国策",
    "tribe": "族群",
}


def alias_map():
    """alias/canonical -> (canonical, cat, note)"""
    m = {}
    for canon, ent in ENTITIES.items():
        m[canon] = (canon, ent["cat"], ent["note"])
        for a in ent.get("aliases", []):
            m[a] = (canon, ent["cat"], ent["note"])
    return m
