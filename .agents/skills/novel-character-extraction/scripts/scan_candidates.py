#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""小说人物候选扫描器（纯标准库，无第三方依赖）。

把整本书切成带重叠的分块，并用多组模式扫出"疑似人名"候选，
供后续逐块精读与全局归并使用。设计原则是召回优先：
宁可多扫、不可漏扫；误报过滤交给后续环节并留痕。

用法：
  python3 scan_candidates.py <书籍路径> [--workdir DIR] [--chunk-size N] [--overlap N]

<书籍路径> 支持：
  - 单个 .txt / .md 文件（编码自动识别：UTF-8 / UTF-16 / GB18030 / Big5）
  - 含多个章节文件的目录（按文件名自然排序合并）
  - .epub（自动解包提取正文）

输出（写入工作目录）：
  meta.json                 元信息与分块索引
  chunks/chunk-0001.txt …   带重叠的纯文本分块
  candidates.json           候选人名（出现次数、来源模式、上下文样例）
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path

CJK = r"\u4e00-\u9fa5"
CJK_CLS = "[" + CJK + "]"

# ---------- 中文姓氏表（召回用，宁多勿少） ----------
SINGLE_SURNAMES = (
    "李王张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董潘袁蒋蔡余杜叶程"
    "苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦傅方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛"
    "郝龚邵万钱严覃武戴莫孔向汤常温康施文牛樊葛邢安齐易乔伍庞颜倪庄聂章鲁岳翟殷詹申欧耿关兰"
    "焦俞左甘祝包宁尚符舒阮柯纪梅童凌毕单季裴霍涂成苗谷盛曲翁冉骆蓝路游辛靳管柴蒙鲍华喻蒲卓"
    "屠池郁胥闻苍双满权席麦燕宫卞邬闵解强应屈桂项简丰缪蔚越隆师巩厍晁勾敖融冷訾阚那简饶空乜云佘"
    "沙养鞠须巢蒯相查后荆红逄盖益桓邝郜栾母桑桂濮扈冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼"
    "容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东殴殳沃利蔚越夔隆师巩厍"
)
COMPOUND_SURNAMES = (
    "欧阳太史端木上官司马东方独孤南宫万俟闻人夏侯诸葛尉迟公羊赫连澹台皇甫宗政濮阳公冶太叔"
    "申屠公孙慕容仲孙钟离长孙宇文司徒鲜于司空闾丘亓官司寇巫马公西颛孙公良漆雕乐正宰父谷梁"
    "拓跋夹谷轩辕令狐段干百里呼延东郭南门羊舌微生梁丘第五东里即墨达奚"
)

# ---------- 模式词表 ----------
SPEECH_VERBS = (
    "说道 笑道 问道 答道 喊道 叫道 骂道 吼道 叹道 喝道 唱道 念道 读道 应道 回道 劝道 逼问 反问 追问 "
    "低声道 沉声道 大声道 冷冷道 淡淡道 苦笑道 大笑道 接口道 接着道 补充道 反驳道 嘀咕道 嘟囔道 嚷道 "
    "开口 插嘴 嘀咕 喃喃 低语 吩咐 叮嘱 嘱咐 回话 接话 附和 冷笑 大笑 苦笑 惨笑 说道 道 说 问 答 喊 叫 "
    "骂 吼 笑 叹 劝 命 嚷"
)
ACTION_VERBS = (
    "走进 走出 走来 跑来 跑去 冲过来 冲上前 冲上去 站起身 站起 坐下 坐了 点了点头 点头 摇了摇头 摇头 "
    "皱眉 挑眉 瞪眼 伸手 抬手 挥手 转身 回头 离开 赶到 跟上 拦住 拉住 拽住 推门 叩门 敲门 拱手 抱拳 "
    "跪下 磕头 上马 下马 抢先 接过 递过 扔给 望着 盯着 看着 瞥了 愣住 怔住 醒来 睁眼 闭眼 叹了口气 "
    "松了口气 倒吸一口凉气 掏出 拔出 挥剑 出剑 收剑 弯腰 抬脚 迈步 落座 起身"
)
MENTION_KEYWORDS = (
    "名叫 叫做 叫作 名字叫 名字是 名字为 名为 唤作 唤做 称作 称为 人称 外号 绰号 诨号 诨名 小名 乳名 "
    "大号 笔名 网名 化名 艺名 法号 道号 封号 谥号 表字 字是 字为 叫 唤 称 姓 号"
)
SELF_KEYWORDS = (
    "我叫 我叫做 我叫作 吾名 吾乃 在下 鄙人 本座 我是 俺叫 俺是 本人 姑娘我 老夫 咱家"
)
HONOR_PREFIX = "老小大阿"
HONOR_SUFFIX = (
    "总 董 老板 教授 老师 大夫 医生 哥 姐 弟 妹 叔 伯 婶 姨 爷 奶 公 婆 先生 女士 师傅 师父 工 队长 "
    "警官 经理 主任 校长 院长 大人 公子 小姐 姑娘 太守 知府 知县 县令 县丞 将军 都头 员外 千户 把总 "
    "参将 总兵 提督 巡抚 总督 尚书 侍郎 御史 阁老 太尉 司徒 司空 司马 军师 谋士 镖头 掌柜 当家 头领 "
    "大王 皇上 皇后 太后 太子 王爷 贝勒 贝子 中堂 学士 太监 公公"
)

# ---------- 清洗与停用 ----------
LEAD_JUNK = set("的了呢吗吧嘛呀啊哦噢喔么之与其和并或但被把将让向从对在是有不没也都很便又就还才刚正再连即则乃而且若虽听对跟见教叫让和与同给朝往冲替帮伴随带领派请邀劝催逼托求命令嘱咐叮嘱见闻报传唤率携去个他她它我你谁俺咱")
TRAIL_JUNK = set("的了吗呢吧嘛呀啊哦噢喔么着起来去来们等这些那位个")
QUOTES = "「『“”\"'’‘」』《》〈〉·：:，。！？、；…—～()（）<>【】〔〕"
# 名字里不可能出现的字：出现即整体否决
FORBIDDEN_INSIDE = set("们这那哪谁")
STOP_CANDIDATES = {
    "他们", "她们", "它们", "我们", "你们", "自己", "大家", "众人", "老百众", "老百姓",
    "两人", "三人", "几人", "一人", "有人", "某人", "俩人", "大伙", "大伙儿", "一行人",
    "两人组", "这个时候", "的话", "所谓", "这里", "那里", "哪里", "什么", "怎么", "这样",
    "那样", "如今", "此时", "当时", "后来", "终于", "忽然", "突然", "只是", "但是", "可是",
    "俺们", "咱们", "你们几个", "几个人", "他的", "她的", "我的", "你的",
}

# ---------- 读取与归一化 ----------


def decode_bytes(raw: bytes) -> tuple[str, str]:
    for enc in ("utf-8-sig", "utf-8", "utf-16", "gb18030", "big5"):
        try:
            return raw.decode(enc), enc
        except (UnicodeDecodeError, UnicodeError):
            continue
    return raw.decode("utf-8", errors="replace"), "utf-8(replace)"


class _HTMLText(HTMLParser):
    """提取 HTML 正文，块级标签转换行。"""

    BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip += 1
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._skip:
            self._skip -= 1
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def _html_to_text(html_text: str) -> str:
    parser = _HTMLText()
    try:
        parser.feed(html_text)
        parser.close()
    except Exception:
        return html_text
    return "".join(parser.parts)


def read_book(path: Path) -> tuple[str, str, list[str]]:
    """返回 (归一化全文, 编码, 合并来源文件名列表)。"""
    if path.is_dir():
        files = sorted(
            (f for f in path.iterdir() if f.is_file() and f.suffix.lower() in (".txt", ".md") and not f.name.startswith(".")),
            key=lambda f: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", f.name)],
        )
        if not files:
            raise SystemExit(f"目录里没有 .txt/.md 文件：{path}")
        parts, names = [], []
        for f in files:
            text, _ = decode_bytes(f.read_bytes())
            parts.append(f"\n<<<FILE: {f.name}>>>\n" + text)
            names.append(f.name)
        return normalize("".join(parts)), "mixed", names

    if path.suffix.lower() == ".epub":
        parts, names = [], []
        with zipfile.ZipFile(path) as zf:
            for info in zf.infolist():
                if not info.filename.lower().endswith((".xhtml", ".html", ".htm")):
                    continue
                raw = zf.read(info.filename)
                text, _ = decode_bytes(raw)
                body = _html_to_text(text)
                if len(body.strip()) < 50:
                    continue
                parts.append(f"\n<<<FILE: {info.filename}>>>\n" + body)
                names.append(info.filename)
        if not parts:
            raise SystemExit(f"epub 中没有可提取的正文：{path}")
        return normalize("".join(parts)), "epub-utf8", names

    text, enc = decode_bytes(path.read_bytes())
    return normalize(text), enc, [path.name]


def normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


# ---------- 分块 ----------


def make_chunks(text: str, size: int, overlap: int) -> list[dict]:
    """按段落聚合分块；单个超长段落硬切。返回 [{text,start,end}]（字符偏移，近似）。"""
    paras: list[str] = []
    for p in text.split("\n"):
        if len(p) > size:
            for i in range(0, len(p), size):
                paras.append(p[i : i + size])
        else:
            paras.append(p)

    chunks: list[dict] = []
    buf: list[str] = []
    cur = 0
    offset = 0
    buf_start = 0

    def flush():
        nonlocal buf, cur, offset, buf_start
        body = "\n".join(buf)
        chunks.append({"text": body, "start": buf_start, "end": buf_start + len(body)})
        # 保留尾部约 overlap 字符作为下一块开头
        tail: list[str] = []
        t = 0
        for q in reversed(buf):
            if t + len(q) + 1 > overlap:
                break
            tail.insert(0, q)
            t += len(q) + 1
        consumed = sum(len(x) + 1 for x in buf) - t
        offset += consumed
        buf_start = offset
        buf = tail
        cur = t

    for p in paras:
        if cur + len(p) > size and buf:
            flush()
        buf.append(p)
        cur += len(p) + 1
    if buf:
        body = "\n".join(buf)
        chunks.append({"text": body, "start": buf_start, "end": buf_start + len(body)})
    return chunks


# ---------- 候选扫描 ----------


def _verbs(words: str) -> str:
    return "|".join(sorted(words.split(), key=len, reverse=True))


def build_patterns():
    singles = SINGLE_SURNAMES
    compounds = "|".join(
        sorted({COMPOUND_SURNAMES[i : i + 2] for i in range(0, len(COMPOUND_SURNAMES), 2)}, key=len, reverse=True)
    )
    honor_suffix = "|".join(sorted(HONOR_SUFFIX.split(), key=len, reverse=True))
    mention_kw = "|".join(sorted(MENTION_KEYWORDS.split(), key=len, reverse=True))
    self_kw = "|".join(sorted(SELF_KEYWORDS.split(), key=len, reverse=True))
    honor_pre = "|".join(HONOR_PREFIX)

    return {
        "speech": re.compile(f"({CJK_CLS}{{2,4}})(?:{_verbs(SPEECH_VERBS)})"),
        "colon_quote": re.compile(f"({CJK_CLS}{{2,4}})[：:]\\s*[「『\"“]"),
        "action": re.compile(f"({CJK_CLS}{{2,4}})(?:{_verbs(ACTION_VERBS)})"),
        "mention": re.compile(f"(?:{mention_kw})(?:[是为做]|做)?\\s*[「『\"“]?({CJK_CLS}{{2,6}})[」』\"”]?"),
        "self": re.compile(f"(?:{self_kw})({CJK_CLS}{{2,4}})"),
        # 姓+称谓 / 姓+名 组合不加前瞻：后接汉字是常态（"孙先生心善"），宁可多扫，误报交后续过滤
        "honor_pre": re.compile(f"(?:{honor_pre})([{singles}])"),
        "honor_suf": re.compile(f"([{singles}])(?:{honor_suffix})"),
        "ngram_single": re.compile(f"([{singles}])({CJK_CLS}{{1,2}})"),
        "ngram_compound": re.compile(f"(?:{compounds})({CJK_CLS}{{1,2}})"),
        "role": re.compile(f"({CJK_CLS}{{1,2}})氏"),
    }


def _clean(name: str) -> str:
    name = name.strip(QUOTES)
    while name and name[0] in LEAD_JUNK:
        name = name[1:]
    while name and name[-1] in TRAIL_JUNK:
        name = name[:-1]
    return name.strip(QUOTES)


def _valid(name: str) -> bool:
    if len(name) < 2 or len(name) > 8:
        return False
    if re.search(r"[0-9A-Za-z0-9]", name):
        return False
    if name in STOP_CANDIDATES:
        return False
    if any(ch in FORBIDDEN_INSIDE for ch in name):
        return False
    return True


def scan_candidates(text: str, min_ngram_count: int = 3, max_ngram: int = 3000) -> list[dict]:
    pats = build_patterns()
    cands: dict[str, set] = {}
    ngram_counter: dict[str, int] = {}

    def add(name: str, tier: str):
        name = _clean(name)
        if not _valid(name):
            return
        cands.setdefault(name, set()).add(tier)

    for m in pats["speech"].finditer(text):
        add(m.group(1), "speech")
    for m in pats["colon_quote"].finditer(text):
        add(m.group(1), "speech")
    for m in pats["action"].finditer(text):
        add(m.group(1), "action")
    for m in pats["mention"].finditer(text):
        add(m.group(1), "mention")
    for m in pats["self"].finditer(text):
        add(m.group(1), "self")
    for m in pats["honor_pre"].finditer(text):
        add(m.group(0), "honor")
    for m in pats["honor_suf"].finditer(text):
        add(m.group(0), "honor")
    for m in pats["role"].finditer(text):
        add(m.group(0), "mention")
    for m in pats["ngram_single"].finditer(text):
        name = m.group(0)
        ngram_counter[name] = ngram_counter.get(name, 0) + 1
    for m in pats["ngram_compound"].finditer(text):
        name = m.group(0)
        ngram_counter[name] = ngram_counter.get(name, 0) + 1

    strong = {n for n, tiers in cands.items() if tiers != {"ngram"}}
    for name, cnt in ngram_counter.items():
        if cnt >= min_ngram_count and name not in strong and _valid(name):
            cands.setdefault(name, set()).add("ngram")

    ngram_sorted = sorted(
        ((n, t) for n, t in cands.items() if t == {"ngram"}),
        key=lambda kv: (-ngram_counter.get(kv[0], 0), kv[0]),
    )
    capped_ngram = {n for n, _ in ngram_sorted[:max_ngram]}

    out = []
    for name, tiers in sorted(cands.items(), key=lambda kv: (-text.count(kv[0]), kv[0])):
        if tiers == {"ngram"} and name not in capped_ngram:
            continue
        count = text.count(name)
        if count == 0:
            continue
        contexts = []
        start = 0
        for _ in range(3):
            i = text.find(name, start)
            if i < 0:
                break
            lo, hi = max(0, i - 22), i + len(name) + 22
            contexts.append(text[lo:hi].replace("\n", "⏎"))
            start = i + len(name)
        out.append({"name": name, "count": count, "tiers": sorted(tiers), "contexts": contexts})
    return out


# ---------- 主流程 ----------


def main() -> None:
    ap = argparse.ArgumentParser(description="小说人物候选扫描：分块 + 多模式候选提取")
    ap.add_argument("book", help="书籍路径（.txt/.md 文件、章节目录或 .epub）")
    ap.add_argument("--workdir", help="工作目录（默认 <书籍所在目录>/人物提取-<书名>/）")
    ap.add_argument("--chunk-size", type=int, default=10000, help="每块目标字符数（默认 10000）")
    ap.add_argument("--overlap", type=int, default=600, help="相邻块重叠字符数（默认 600）")
    ap.add_argument("--min-ngram-count", type=int, default=3, help="纯姓氏组合候选的最低出现次数")
    ap.add_argument("--max-ngram", type=int, default=3000, help="纯姓氏组合候选的数量上限")
    ap.add_argument("--top", type=int, default=40, help="stdout 预览的候选条数")
    args = ap.parse_args()

    book = Path(args.book).expanduser().resolve()
    if not book.exists():
        raise SystemExit(f"找不到书籍：{book}")
    workdir = Path(args.workdir).expanduser().resolve() if args.workdir else book.parent / f"人物提取-{book.stem}"
    (workdir / "chunks").mkdir(parents=True, exist_ok=True)

    text, enc, files = read_book(book)
    chunks = make_chunks(text, args.chunk_size, args.overlap)

    chunk_index = []
    for i, c in enumerate(chunks, 1):
        fname = f"chunk-{i:04d}.txt"
        (workdir / "chunks" / fname).write_text(c["text"], encoding="utf-8")
        chunk_index.append(
            {"file": fname, "start": c["start"], "end": c["end"], "pct": round(c["start"] / max(len(text), 1), 4)}
        )

    cands = scan_candidates(text, args.min_ngram_count, args.max_ngram)
    (workdir / "candidates.json").write_text(
        json.dumps(cands, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    meta = {
        "book": book.name,
        "book_path": str(book),
        "book_stem": book.stem,
        "kind": "dir" if book.is_dir() else ("epub" if book.suffix.lower() == ".epub" else "file"),
        "encoding": enc,
        "files_merged": files,
        "total_chars": len(text),
        "chunk_size": args.chunk_size,
        "overlap": args.overlap,
        "chunk_count": len(chunks),
        "candidate_count": len(cands),
        "chunks": chunk_index,
    }
    (workdir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"书名: {book.name}  编码: {enc}  全书字符: {len(text):,}")
    print(f"分块: {len(chunks)} 块（每块约 {args.chunk_size} 字，重叠 {args.overlap} 字）→ {workdir / 'chunks'}")
    print(f"候选: {len(cands)} 条 → {workdir / 'candidates.json'}")
    print(f"\n出现次数最高的 {args.top} 条候选：")
    for c in cands[: args.top]:
        print(f"  {c['name']}  ×{c['count']}  [{','.join(c['tiers'])}]  {c['contexts'][0] if c['contexts'] else ''}"[:120])


if __name__ == "__main__":
    main()
