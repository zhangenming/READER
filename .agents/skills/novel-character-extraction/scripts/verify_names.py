#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""人名名单核验 + 召回审计（纯标准库）。

两个职责：
1. 核验（防虚报）：把归并后的名单逐条放回原文精确计数，
   canonical 0 次的是幻觉、别名 0 次的是笔误、子串重复计数会被扣除。
2. 审计（防遗漏）：把候选扫描（candidates.json）中没有任何名单条目
   能覆盖的候选列出来，逐条裁决（收录或过滤+理由）后才能定稿。

用法：
  python3 verify_names.py --text <书籍路径> --names <名单.json> \
      --workdir <工作目录> [--candidates candidates.json] [--min-count 2]

<名单.json> 接受 {"characters":[…]} 或直接数组，条目形如：
  {"canonical": "沈青梧", "aliases": ["青梧", "沈姑娘"], …}

输出：<workdir>/verification.json，stdout 打摘要。
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from scan_candidates import read_book


def load_names(path: Path) -> tuple[list[dict], list[dict]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        chars_in = data.get("characters") or data.get("names") or []
        collectives_in = data.get("collectives") or []
    else:
        chars_in, collectives_in = data, []
    out = []
    for item in chars_in:
        if not isinstance(item, dict):
            continue
        canon = item.get("canonical") or item.get("name")
        if not canon:
            continue
        out.append(
            {
                "canonical": canon,
                "aliases": [a for a in (item.get("aliases") or []) if a and a != canon],
                "extra": {k: v for k, v in item.items() if k not in ("canonical", "name", "aliases")},
            }
        )
    colls = []
    for item in collectives_in:
        if isinstance(item, dict) and item.get("name"):
            colls.append(item)
    return out, colls


def count_variant(text: str, variant: str, longer: str | None) -> int:
    """计 variant 出现次数；若 variant 是 longer 的子串，扣除落在 longer 内部的重叠。"""
    if longer and variant != longer and variant in longer:
        k = longer.find(variant)
        prev_char = longer[k - 1]
        pat = re.compile("(?<!" + re.escape(prev_char) + ")" + re.escape(variant))
        return len(pat.findall(text))
    return text.count(variant)


def _occurrences(canon: str, aliases: list[str], text: str) -> dict:
    occ = {"canonical": text.count(canon), "aliases": {}}
    for a in aliases:
        occ["aliases"][a] = count_variant(text, a, canon)
    occ["total"] = occ["canonical"] + sum(occ["aliases"].values())
    return occ


def _first_context(text: str, s: str) -> str:
    i = text.find(s)
    if i < 0:
        return ""
    lo, hi = max(0, i - 20), i + len(s) + 20
    return text[lo:hi].replace("\n", "⏎")


def verify(text: str, chars: list[dict]) -> list[dict]:
    all_names = [(c["canonical"], c) for c in chars]
    results = []
    for c in chars:
        canon, aliases = c["canonical"], c["aliases"]
        issues, notes = [], []
        occ = _occurrences(canon, aliases, text)

        if occ["canonical"] == 0:
            issues.append(f"canonical「{canon}」在原文出现 0 次：疑似幻觉或写法不符，须改正或删除")
        for a, n in occ["aliases"].items():
            if n == 0:
                issues.append(f"别名「{a}」出现 0 次：查上下文改正或移除")
        if canon in aliases:
            issues.append("canonical 同时出现在 aliases 里，去重")

        # 子串关系：canonical ⊂ 其他 canonical / 别名 ⊂ 其他人的名字
        for other, oc in all_names:
            if oc is c:
                continue
            if canon != other and canon in other:
                notes.append(f"「{canon}」是「{other}」的子串：确认两条是否同一人，或别名归属")
            for a in aliases:
                if a != other and a in other:
                    notes.append(f"别名「{a}」是「{other}」的子串：确认归属是否正确")

        results.append(
            {
                "canonical": canon,
                "aliases": aliases,
                "occurrences": occ,
                "issues": issues,
                "notes": notes,
                "extra": c["extra"],
            }
        )
    return results


def audit(cands: list[dict], chars: list[dict], text: str, min_count: int, ctx_top: int = 200, collectives: list[dict] | None = None) -> list[dict]:
    known: list[str] = []
    for c in chars:
        known.append(c["canonical"])
        known.extend(c["aliases"])
    for col in collectives or []:
        known.append(col["name"])
        known.extend(col.get("refers_to") or [])

    def covered(cand: str) -> bool:
        return any(cand == k or cand in k for k in known)

    unaccounted = []
    for cand in cands:
        name, cnt = cand["name"], cand["count"]
        if cnt < min_count or covered(name):
            continue
        unaccounted.append({"name": name, "count": cnt})

    unaccounted.sort(key=lambda x: (-x["count"], x["name"]))
    for i, item in enumerate(unaccounted):
        if i < ctx_top:
            ctxs = []
            start = 0
            for _ in range(2):
                j = text.find(item["name"], start)
                if j < 0:
                    break
                lo, hi = max(0, j - 20), j + len(item["name"]) + 20
                ctxs.append(text[lo:hi].replace("\n", "⏎"))
                start = j + len(item["name"])
            item["contexts"] = ctxs
    return unaccounted


def main() -> None:
    ap = argparse.ArgumentParser(description="人名名单核验 + 召回审计")
    ap.add_argument("--text", required=True, help="书籍路径（与扫描时同一来源）")
    ap.add_argument("--names", required=True, help="名单 JSON（merged-draft.json 或 characters.json）")
    ap.add_argument("--workdir", required=True, help="工作目录")
    ap.add_argument("--candidates", help="candidates.json 路径（默认 <workdir>/candidates.json）")
    ap.add_argument("--min-count", type=int, default=2, help="审计覆盖的候选最低出现次数（默认 2）")
    args = ap.parse_args()

    book = Path(args.text).expanduser().resolve()
    workdir = Path(args.workdir).expanduser().resolve()
    text, _, _ = read_book(book)

    chars, collectives = load_names(Path(args.names).expanduser().resolve())
    if not chars:
        raise SystemExit(f"名单里没有任何条目：{args.names}")

    results = verify(text, chars)
    issue_count = sum(len(r["issues"]) for r in results)

    cands_path = Path(args.candidates).expanduser().resolve() if args.candidates else workdir / "candidates.json"
    unaccounted: list[dict] = []
    if cands_path.exists():
        cands = json.loads(cands_path.read_text(encoding="utf-8"))
        unaccounted = audit(cands, chars, text, args.min_count, collectives=collectives)
    else:
        print(f"[提示] 没找到 {cands_path}，跳过召回审计")

    out = {
        "summary": {
            "characters": len(chars),
            "issues": issue_count,
            "unaccounted_candidates": len(unaccounted),
        },
        "characters": results,
        "unaccounted": unaccounted,
    }
    dest = workdir / "verification.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    total_mentions = sum(r["occurrences"]["total"] for r in results)
    print(f"核验完成 → {dest}")
    print(f"人物 {len(chars)} 条 · 提及合计 {total_mentions:,} 次 · 问题 {issue_count} 条 · 未覆盖候选 {len(unaccounted)} 条")
    if issue_count:
        print("\n[问题清单]（全部处理完才能定稿）")
        for r in results:
            for msg in r["issues"]:
                print(f"  ✗ {msg}")
    if unaccounted:
        print(f"\n[未覆盖候选]（逐条裁决：收录，或过滤+理由）—— 按出现次数降序，最多展示 40 条")
        for item in unaccounted[:40]:
            ctx = item.get("contexts", [""])[0] if item.get("contexts") else ""
            print(f"  ? {item['name']}  ×{item['count']}  {ctx}"[:120])


if __name__ == "__main__":
    main()
