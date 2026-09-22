#!/usr/bin/env python3
# 把《解放战争》（套装共6册，Kindle 版式 epub）抽成纯文本。
# 约定：
#   * 按 OPF spine 顺序遍历 XHTML 分篇，块级元素各成一段；<br> 在标题里折成空格，在正文里换行
#   * 6 册各自从“第1章”重新编号，用各册 toc 的 <title> 作为书名，在每册开头补一行
#     “第X部　决战：…”，让阅读器把它认成分卷标题；各册的印刷目录页丢掉不输出
#   * 行内脚注 <a id="fnN"><span class="math-super">[N]</span></a> -> [N]（原文已带方括号）
#     章末 kindle-cn-footnotes 段落原样保留，成为 “[N]《书目》” 形式的夹注
#   * 序列表与文前彩插是扫描图片，txt 无法承载，只留下 kindle-cn-caption 图注
#   * 表格 kindle-cn-table-dgl0 按行输出，单元格之间加空格
import re
import sys
import zipfile
from html.parser import HTMLParser

BLOCK = {"p", "div", "blockquote", "center", "li", "tr",
         "h1", "h2", "h3", "h4", "h5", "h6"}
HEAD = {"h1", "h2", "h3", "h4", "h5", "h6"}
CN_NUM = "一二三四五六七八九十"


class Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.buf = []
        self.open_block = None
        self.heading_mode = False

    def flush(self):
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if text:
            self.blocks.append((text, self.open_block or "p"))

    def handle_starttag(self, tag, attrs):
        if tag in BLOCK:
            self.flush()
            self.open_block = tag
            self.heading_mode = tag in HEAD
        elif tag == "td":
            self.buf.append(" ")
        elif tag == "br":
            if self.heading_mode:
                self.buf.append(" ")
            else:
                self.flush()

    def handle_endtag(self, tag):
        if tag in BLOCK:
            self.flush()
            self.open_block = None
            self.heading_mode = False

    def handle_data(self, data):
        self.buf.append(data)


def preprocess(html):
    html = re.sub(r"<img\b[^>]*?/?>", "", html)      # 图片（含正文内联的印章小图）
    # 图注里靠右排的“附表N”原本与图名分列两端，去标签后会粘成“（1946年6月）附表2”，补个空格
    html = re.sub(r'<span style="float:right">', ' <span style="float:right">', html)
    html = re.sub(r"</?(?:a|span|b|i|em|strong|sup|sub)\b[^>]*>", "", html)
    return html


def tidy(text):
    text = re.sub(r"]\s+(?=[一-鿿])", "]", text)      # 引注 “[1]然而” 不拆开
    text = re.sub(r" {2,}", " ", text).strip()
    return text


def book_titles(z, id2href, spine):
    """每册的书名取自该册 toc 分篇的 <title>，spine id 形如 x_a1toc。"""
    titles = {}
    for sid in spine:
        m = re.fullmatch(r"x_a(\d+)toc", sid)
        href = id2href.get(sid)
        if not m or not href:
            continue
        html = z.read("OEBPS/" + href).decode("utf-8", "replace")
        t = re.search(r"<title>(.*?)</title>", html, re.S)
        if t:
            titles[int(m.group(1))] = t.group(1).strip()
    return titles


def main(epub_path, out_path):
    z = zipfile.ZipFile(epub_path)
    opf = z.read("OEBPS/content.opf").decode("utf-8")
    id2href = dict(re.findall(r'<item id="([^"]+)"[^>]*?href="([^"]+)"', opf))
    spine_xml = re.search(r"<spine.*?</spine>", opf, re.S).group(0)
    spine = [s for s in re.findall(r'idref="([^"]+)"', spine_xml) if s in id2href]
    titles = book_titles(z, id2href, spine)

    parts = {}      # 册号 -> 段落列表
    seeded = set()
    for sid in spine:
        m = re.match(r"x_a(\d+)", sid)
        book = int(m.group(1)) if m else 0
        # 各册印刷目录不进 txt：阅读器的章节目录由正文标题生成，保留目录页反而会重复计入。
        if not m or sid.endswith("toc"):
            continue
        html = z.read("OEBPS/" + id2href[sid]).decode("utf-8", "replace")
        body = re.search(r"<body[^>]*>(.*)</body>", html, re.S)
        if not body:
            continue
        blocks = parts.setdefault(book, [])
        if book not in seeded and book in titles:
            blocks.append((f"第{CN_NUM[book - 1]}部　{titles[book]}", "h1"))
            seeded.add(book)
        ex = Extractor()
        ex.feed(preprocess(body.group(1)))
        ex.flush()
        for text, tag in ex.blocks:
            text = tidy(text)
            if text:
                blocks.append((text, tag))

    all_blocks = [b for book in sorted(parts) for b in parts[book]]
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n\n".join(t for t, _ in all_blocks) + "\n")
    for book in sorted(parts):
        chars = sum(len(t) for t, _ in parts[book])
        print(f"  册{book} 段落 {len(parts[book]):5d} 字数 {chars:8d}")
    print(f"合并 {len(spine)} 篇 -> 段落 {len(all_blocks)} 字数 "
          f"{sum(len(t) for t, _ in all_blocks)} 文件 {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
