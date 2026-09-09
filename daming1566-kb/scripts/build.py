# -*- coding: utf-8 -*-
"""《大明王朝1566》知识阅读器构建脚本。

参照 baojie/shiji-kb 的章节页体例：
  原文 → 实体标注 → 语法高亮 HTML + 段落编号(Purple Numbers) + 实体索引页

用法:
  python3 scripts/build.py                 # 全量构建 docs/ 与 chapter_md/
  python3 scripts/build.py --tagged-only   # 只重生成 chapter_md/（调试标注用）
"""
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from entities import ENTITIES, MARKERS, CATEGORY_LABELS, alias_map

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK_PATH = os.environ.get(
    "DM1566_TXT",
    "/Users/zem/AI/READER/txt/大明王朝1566（上下卷） (刘和平) (z-library.sk, 1lib.sk, z-lib.sk).txt",
)
DOCS = os.path.join(ROOT, "docs")
CHAPTER_MD = os.path.join(ROOT, "chapter_md")

BOOK_TITLE = "大明王朝1566"
AUTHOR = "刘和平"

# ---------------- 正则（时间 / 钱粮 / 典籍） ----------------
ERAS = "嘉靖|隆庆|正德|景泰|天顺|成化|弘治|宣德|永乐|洪武|万历|泰昌|天启|崇祯"
RE_BOOK = re.compile(r"《[^《》]{1,24}》")
RE_GYEAR = re.compile(r"公元[0-9〇零一二三四五六七八九十百]{1,5}年")
RE_ERA = re.compile(r"(?:%s)(?:[零一二三四五六七八九十百]{1,6})?年" % ERAS)
# 月日：不带“日”的裸日期仅接受 初X/十X/廿X/两位数；带“日”可接受单数字
RE_DATE = re.compile(
    r"(?:正|[一二三四五六七八九十]{1,3}|腊|冬|元)月"
    r"(?:(?:初[一二三四五六七八九十]|[十廿卅][零一二三四五六七八九十]{0,2}|[二三四五六七八九十][零一二三四五六七八九十]{1,2})日?"
    r"|[零一二三四五六七八九十]{1,3}日|[0-9]{1,2}日)?"
)
RE_MONEY = re.compile(
    r"[零一二三四五六七八九十百千万]{1,14}(?:两|石|贯|文|匹|张|艘)"
    r"|[0-9]{1,10}万?(?:两|石|贯|文|匹|张|艘)"
)

REGEX_RULES = [
    (RE_BOOK, "book"),
    (RE_GYEAR, "time"),
    (RE_ERA, "time"),
    (RE_DATE, "time"),
    (RE_MONEY, "quantity"),
]

NUMERAL_TRIGGER = set(
    "《公元嘉靖隆庆正德景泰天顺成化弘治宣德永乐洪武万历泰昌天启崇祯正腊冬元月"
    "零一二三四五六七八九十百千万廿卅〇0123456789"
)

AMAP = alias_map()
ALIAS_LENS = sorted({len(a) for a in AMAP}, reverse=True)
ALIAS_FIRST = {a[0] for a in AMAP}


# ---------------- 解析 ----------------
HEAD_RE = re.compile(r"^(楔子|第[一二三四五六七八九十]+章)$")


def parse_book():
    """返回 [ {idx,key,title,paras} ]。跳过开头的版权页与目录。"""
    text = open(BOOK_PATH, encoding="utf-8").read()
    lines = text.split("\n")
    heads = [i for i, l in enumerate(lines) if HEAD_RE.match(l.strip())]
    if not heads:
        raise SystemExit("未找到章节标题")
    # 目录里也会出现一遍标题；正文从最后一次“楔子”开始
    start = max(i for i in heads if lines[i].strip() == "楔子")
    body_heads = [i for i in heads if i >= start]

    chapters = []
    for k, ln in enumerate(body_heads):
        end = body_heads[k + 1] if k + 1 < len(body_heads) else len(lines)
        paras = [l.strip() for l in lines[ln + 1:end] if l.strip()]
        chapters.append(
            {
                "idx": k,
                "key": "%02d" % k,
                "title": lines[ln].strip(),
                "paras": paras,
            }
        )
    return chapters


# ---------------- 标注 ----------------
def tag_paragraph(p):
    """返回 [(text, cat, canon)] 片段序列。canon 为实体锚点名。"""
    segs, i, n = [], 0, len(p)
    while i < n:
        ch = p[i]
        hit = False
        if ch in "《" or ch in NUMERAL_TRIGGER:
            for regex, cat in REGEX_RULES:
                m = regex.match(p, i)
                if m:
                    w = m.group()
                    # 典籍锚点取书名号内文字，时间/钱粮锚点即原文
                    canon = w.strip("《》") if cat == "book" else w
                    segs.append((w, cat, canon))
                    i = m.end()
                    hit = True
                    break
        if hit:
            continue
        if ch in ALIAS_FIRST:
            for L in ALIAS_LENS:
                if i + L <= n:
                    w = p[i:i + L]
                    if w in AMAP:
                        canon, cat, _ = AMAP[w]
                        segs.append((w, cat, canon))
                        i += L
                        hit = True
                        break
        if not hit:
            segs.append((ch, None, None))
            i += 1
    return segs


def collect_entities(chapters):
    """扫描全书，得到统计与首末出现章。返回 (entity_stats, total_annotations, cat_annotations)"""
    stats = {}
    counter = {"total": 0}
    cat_ann = {}

    def touch(canon, cat, cidx):
        counter["total"] += 1
        cat_ann[cat] = cat_ann.get(cat, 0) + 1
        st = stats.setdefault(
            canon, {"cat": cat, "count": 0, "first": cidx, "last": cidx}
        )
        st["count"] += 1
        st["last"] = cidx

    for ch in chapters:
        for p in ch["paras"]:
            for text, cat, canon in tag_paragraph(p):
                if cat is None:
                    continue
                touch(canon, cat, ch["idx"])
    return stats, counter["total"], cat_ann


# ---------------- 生成：章节页 ----------------
def seg_to_html(text, cat, canon, chapter_root=False):
    esc = html.escape(text)
    if cat is None:
        return esc
    label = CATEGORY_LABELS[cat]
    if canon is not None:
        cls = cat
        return (
            '<a class="entity-link" href="../entities/%s.html#entity-%s" target="_blank">'
            '<span class="%s" title="%s">%s</span></a>'
            % (cat, canon, cls, label, esc)
        )
    return '<span class="%s" title="%s">%s</span>' % (cat, label, esc)


def para_to_html(p):
    return "".join(seg_to_html(*s) for s in tag_paragraph(p))


def para_to_md(p):
    out = []
    for text, cat, canon in tag_paragraph(p):
        if cat is None:
            out.append(text)
            continue
        mk = MARKERS[cat]
        if canon and canon != text and canon != text.strip("《》"):
            out.append("〖%s%s|%s〗" % (mk, text, canon))
        else:
            out.append("〖%s%s〗" % (mk, text))
    return "".join(out)


def gen_chapter_page(ch, chapters):
    prev_ch = chapters[ch["idx"] - 1] if ch["idx"] > 0 else None
    next_ch = chapters[ch["idx"] + 1] if ch["idx"] + 1 < len(chapters) else None
    nav = ['<a href="../index.html">⌂ 主页</a>']
    if prev_ch:
        nav.append('<a href="%s.html">← %s</a>' % (prev_ch["key"], prev_ch["title"]))
    if next_ch:
        nav.append('<a href="%s.html">%s →</a>' % (next_ch["key"], next_ch["title"]))
    nav.append('<a href="../original_text/%s.txt">纯文本</a>' % ch["key"])

    parts = []
    n_chars = sum(len(p) for p in ch["paras"])
    parts.append("<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>")
    parts.append('<meta charset="UTF-8">')
    parts.append('<meta name="viewport" content="width=device-width, initial-scale=1.0">')
    parts.append("<title>%s · %s</title>" % (BOOK_TITLE, ch["title"]))
    parts.append('<link rel="stylesheet" href="../css/styles.css">')
    parts.append("</head>\n<body>")
    parts.append('<button id="settings-toggle" title="显示设置">⚙️</button>')
    parts.append('<div id="settings-panel" hidden></div>')
    parts.append('<nav class="chapter-nav">%s</nav>' % "".join(nav))
    parts.append(
        '<h1><span class="chapter-no">%s</span> %s</h1>' % (ch["key"], html.escape(ch["title"]))
    )
    parts.append(
        '<p class="meta" style="text-indent:0;color:#8a7f70;font-size:.85em;">'
        "正文约 %s 字 · 生成于 AI 知识阅读器</p>" % format(n_chars, ",")
    )
    parts.append("<article>")
    for n, p in enumerate(ch["paras"], 1):
        parts.append(
            '<p><a id="pn-%d" class="para-num" href="#pn-%d" title="点击复制链接">%d</a>%s</p>'
            % (n, n, n, para_to_html(p))
        )
    parts.append("</article>")
    parts.append(
        '<footer class="page-foot">%s · %s 著 · '
        '<a href="../index.html">返回目录</a> · 体例参考 '
        '<a href="https://github.com/baojie/shiji-kb" target="_blank">shiji-kb</a></footer>'
        % (BOOK_TITLE, AUTHOR)
    )
    parts.append('<script src="../js/main.js"></script>')
    parts.append("</body>\n</html>")
    return "\n".join(parts)


# ---------------- 生成：实体页 ----------------
PAGEABLE_CATS = [
    "person", "place", "org", "office", "concept", "tribe", "book", "time", "quantity",
]


def gen_entity_pages(stats, chapters):
    titles = {
        "person": "人物谱", "place": "地点志", "org": "机构衙署",
        "office": "官职身份", "concept": "国策思想", "tribe": "族群", "book": "典籍文书",
        "time": "时间索引", "quantity": "钱粮数额",
    }

    def make_tabs(active):
        return "".join(
            '<a href="%s.html"%s>%s</a>'
            % (c, ' class="active"' if c == active else "", titles[c])
            for c in PAGEABLE_CATS
        )

    # 收集每个类别的条目
    by_cat = {c: [] for c in PAGEABLE_CATS}
    for canon, st in stats.items():
        if st["cat"] in by_cat:
            by_cat[st["cat"]].append((canon, st))

    for cat in PAGEABLE_CATS:
        items = sorted(by_cat[cat], key=lambda x: -x[1]["count"])
        rows = []
        for canon, st in items:
            ent = ENTITIES.get(canon, {})
            aliases = [a for a in ent.get("aliases", []) if a != canon]
            note = ent.get("note", "") if canon in ENTITIES else ""
            first = chapters[st["first"]]["title"] if st["first"] < len(chapters) else ""
            last = chapters[st["last"]]["title"] if st["last"] < len(chapters) else ""
            row = ['<li class="entity-item" id="entity-%s">' % canon]
            row.append('<div class="e-head">')
            row.append('<span class="e-name">%s</span>' % html.escape(canon))
            if aliases:
                row.append(
                    '<span class="e-aliases">亦作：%s</span>'
                    % html.escape("、".join(aliases))
                )
            row.append('<span class="e-count">标注 %d 次</span>' % st["count"])
            row.append("</div>")
            if note:
                row.append('<div class="e-note">%s</div>' % html.escape(note))
            if first == last:
                row.append('<div class="e-chapters">见于 %s</div>' % first)
            else:
                row.append(
                    '<div class="e-chapters">首现 %s · 末现 %s</div>' % (first, last)
                )
            row.append("</li>")
            rows.append("".join(row))

        doc = ["<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>"]
        doc.append('<meta charset="UTF-8">')
        doc.append('<meta name="viewport" content="width=device-width, initial-scale=1.0">')
        doc.append("<title>%s · %s</title>" % (BOOK_TITLE, titles[cat]))
        doc.append('<link rel="stylesheet" href="../css/styles.css">')
        doc.append("</head>\n<body>")
        doc.append('<nav class="chapter-nav"><a href="../index.html">⌂ 主页</a>'
                   '<a href="index.html">知识索引</a></nav>')
        doc.append("<h1>%s</h1>" % titles[cat])
        doc.append('<div class="entity-tabs">%s</div>' % make_tabs(cat))
        doc.append('<ul class="entity-list">%s</ul>' % "".join(rows))
        doc.append('<footer class="page-foot">%s · AI 知识阅读器 · 体例参考 '
                   '<a href="https://github.com/baojie/shiji-kb" target="_blank">shiji-kb</a></footer>'
                   % BOOK_TITLE)
        doc.append("</body>\n</html>")
        with open(os.path.join(DOCS, "entities", "%s.html" % cat), "w", encoding="utf-8") as f:
            f.write("\n".join(doc))


# ---------------- 生成：知识索引总入口 ----------------
def gen_entity_hub(stats, cat_ann, chapters):
    """仿 shiji-kb 的 entities/index.html：类型卡片栅格（条目数 + 出现次数）。"""
    titles = {
        "person": "人物谱", "place": "地点志", "org": "机构衙署",
        "office": "官职身份", "concept": "国策思想", "tribe": "族群", "book": "典籍文书",
        "time": "时间索引", "quantity": "钱粮数额",
    }
    per_cat = {c: [0, 0] for c in PAGEABLE_CATS}  # [条目数, 出现次数]
    for canon, st in stats.items():
        if st["cat"] in per_cat:
            per_cat[st["cat"]][0] += 1
            per_cat[st["cat"]][1] += st["count"]

    cards = []
    for c in sorted(PAGEABLE_CATS, key=lambda x: -per_cat[x][1]):
        n_ent, n_ann = per_cat[c]
        cards.append(
            '<a href="%s.html" class="entity-type-card">'
            '<span class="type-label %s">%s</span>'
            '<span class="type-count">%d 个条目</span>'
            '<span class="type-total">%d 次出现</span></a>'
            % (c, c, titles[c], n_ent, n_ann)
        )

    doc = ["<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>"]
    doc.append('<meta charset="UTF-8">')
    doc.append('<meta name="viewport" content="width=device-width, initial-scale=1.0">')
    doc.append("<title>知识索引 · %s</title>" % BOOK_TITLE)
    doc.append('<link rel="stylesheet" href="../css/styles.css">')
    doc.append("</head>\n<body>")
    doc.append('<nav class="chapter-nav"><a href="../index.html">⌂ 主页</a></nav>')
    doc.append("<h1>知识索引</h1>")
    doc.append(
        "<p style=\"text-indent:0;color:#57503f;\">《%s》全书知识索引，"
        "含人物、地点、机构、官职、时间、钱粮、典籍等 %d 类实体，"
        "各类按出现次数降序排列。点击类型卡片进入详细词条页。</p>"
        % (BOOK_TITLE, len(PAGEABLE_CATS))
    )
    doc.append('<div class="entity-type-grid">%s</div>' % "".join(cards))
    doc.append('<footer class="page-foot">%s · AI 知识阅读器 · 体例参考 '
               '<a href="https://github.com/baojie/shiji-kb" target="_blank">shiji-kb</a></footer>'
               % BOOK_TITLE)
    doc.append("</body>\n</html>")
    with open(os.path.join(DOCS, "entities", "index.html"), "w", encoding="utf-8") as f:
        f.write("\n".join(doc))


# ---------------- 生成：首页 ----------------
def gen_index(chapters, stats, total, cat_ann):
    n_chars = sum(sum(len(p) for p in ch["paras"]) for ch in chapters)
    cat_counts = {}
    for canon, st in stats.items():
        cat_counts[st["cat"]] = cat_counts.get(st["cat"], 0) + 1

    legend = "".join(
        '<span><span class="%s" style="text-decoration:none;font-weight:600">%s</span> %s</span>'
        % (
            c,
            CATEGORY_LABELS[c],
            (
                "%d 条" % cat_counts.get(c, 0)
                if c in ("time", "quantity")
                else "%d" % cat_counts.get(c, 0)
            ),
        )
        for c in ["person", "place", "org", "office", "tribe", "concept", "book"]
    )
    ann_chips = "".join(
        '<span><span class="%s" style="text-decoration:none;font-weight:600">%s</span> %d 次</span>'
        % (c, CATEGORY_LABELS[c], cat_ann.get(c, 0))
        for c in ("time", "quantity")
        if cat_ann.get(c)
    )
    legend = legend + ann_chips

    cards = []
    for ch in chapters:
        excerpt = ch["paras"][0][:56] + "…" if ch["paras"] else ""
        cards.append(
            '<a class="chapter-card" href="chapters/%s.html">'
            '<div class="cc-no">%s</div>'
            '<div class="cc-title">%s</div>'
            '<div class="cc-excerpt">%s</div></a>'
            % (ch["key"], ch["key"], html.escape(ch["title"]), html.escape(excerpt))
        )

    doc = []
    doc.append('<!DOCTYPE html>\n<html lang="zh-CN">\n<head>')
    doc.append('<meta charset="UTF-8">')
    doc.append('<meta name="viewport" content="width=device-width, initial-scale=1.0">')
    doc.append("<title>%s · 知识阅读器</title>" % BOOK_TITLE)
    doc.append('<link rel="stylesheet" href="css/styles.css">')
    doc.append("</head>\n<body>")
    doc.append('<div class="hero">')
    doc.append('<h1 class="book-title">大明王朝<em>1566</em></h1>')
    doc.append('<p class="byline">刘和平 著 · 历史小说</p>')
    doc.append('<p class="pub">江苏人民出版社 2011 · ISBN 978-7-214-07045-6</p>')
    doc.append('<div class="seal">嘉靖四十年 · 改稻为桑</div>')
    doc.append("</div>")
    doc.append('<div class="stats">')
    doc.append("<div class=\"stat\"><b>%d</b><span>章节</span></div>" % len(chapters))
    doc.append("<div class=\"stat\"><b>%s</b><span>正文字数</span></div>" % format(n_chars, ","))
    doc.append("<div class=\"stat\"><b>%s</b><span>实体标注</span></div>" % format(total, ","))
    doc.append("<div class=\"stat\"><b>%d</b><span>实体条目</span></div>" % len(stats))
    doc.append("</div>")
    doc.append('<div class="legend">%s</div>' % legend)
    doc.append('<p style="text-align:center;"><a href="entities/index.html" '
               'style="border:1px solid var(--line);background:var(--card);'
               'border-radius:999px;padding:4px 18px;">知识索引 →</a></p>')
    doc.append('<section class="block toc"><h2>目录</h2>'
               '<div class="chapter-grid">%s</div></section>' % "".join(cards))
    doc.append('<section class="block about"><h2>关于</h2>'
               "<p>本站将《大明王朝1566》全书 %d 章转化为可交互的知识阅读页面："
               "人物、地点、机构、官职、时间、钱粮数额等 %s 次实体标注以不同样式语法高亮，"
               "点击可跳转实体词条；每个段落带编号锚点，可精确引用分享；右上角 ⚙️ 可关闭高亮专注阅读。</p>"
               % (len(chapters), format(total, ",")))
    doc.append("<p>标注体例与页面形态参考 <a href=\"https://github.com/baojie/shiji-kb\" target=\"_blank\">baojie/shiji-kb（史记知识库）</a>，"
               "由 AI 从原始文本自动分章、标注、生成。原文著作权归原作者与出版社所有，"
               "本页面仅供个人阅读研究。</p></section>")
    doc.append('<footer class="page-foot">Generated by <code>scripts/build.py</code> · 大明王朝1566 知识阅读器</footer>')
    doc.append("</body>\n</html>")

    with open(os.path.join(DOCS, "index.html"), "w", encoding="utf-8") as f:
        f.write("\n".join(doc))


# ---------------- 主流程 ----------------
def main():
    tagged_only = "--tagged-only" in sys.argv
    chapters = parse_book()
    print("解析到 %d 章：%s … %s" % (len(chapters), chapters[0]["title"], chapters[-1]["title"]))

    os.makedirs(CHAPTER_MD, exist_ok=True)
    for ch in chapters:
        md = ["# [%s] %s\n" % (ch["idx"], ch["title"])]
        for n, p in enumerate(ch["paras"], 1):
            md.append("[%d] %s\n" % (n, para_to_md(p)))
        with open(os.path.join(CHAPTER_MD, "%s_%s.tagged.md" % (ch["key"], ch["title"])), "w", encoding="utf-8") as f:
            f.write("\n".join(md))
    print("chapter_md/ 已生成 %d 个标注稿" % len(chapters))
    if tagged_only:
        return

    stats, total, cat_ann = collect_entities(chapters)
    print("实体条目 %d，标注总量 %d" % (len(stats), total))

    for ch in chapters:
        page = gen_chapter_page(ch, chapters)
        with open(os.path.join(DOCS, "chapters", "%s.html" % ch["key"]), "w", encoding="utf-8") as f:
            f.write(page)
        with open(os.path.join(DOCS, "original_text", "%s.txt" % ch["key"]), "w", encoding="utf-8") as f:
            f.write("\n\n".join(ch["paras"]))
    print("docs/chapters/ 已生成 %d 个章节页" % len(chapters))

    gen_entity_pages(stats, chapters)
    gen_entity_hub(stats, cat_ann, chapters)
    print("docs/entities/ 已生成实体索引页与知识索引总入口")

    gen_index(chapters, stats, total, cat_ann)
    with open(os.path.join(DOCS, "data", "entity_stats.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "book": BOOK_TITLE,
                "author": AUTHOR,
                "chapters": len(chapters),
                "total_annotations": total,
                "entities": {
                    c: sorted(
                        [
                            {
                                "name": canon,
                                "count": st["count"],
                                "first": chapters[st["first"]]["title"],
                                "note": ENTITIES.get(canon, {}).get("note", ""),
                            }
                            for canon, st in stats.items()
                            if st["cat"] == c
                        ],
                        key=lambda x: -x["count"],
                    )
                    for c in CATEGORY_LABELS
                },
            },
            f, ensure_ascii=False, indent=2,
        )
    print("docs/index.html 与 docs/data/entity_stats.json 已生成")


if __name__ == "__main__":
    main()
