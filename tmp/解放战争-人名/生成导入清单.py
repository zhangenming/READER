# -*- coding: utf-8 -*-
"""生成可直接粘进阅读器「批量导入关键词」的人名清单：一行一个词，无计数、无表头、LF、无 BOM。

输出目录：解放战争-人名导入/
  全部人名.txt            1198 人，按全书提及次数降序
  第1部-中原西南.txt       该册出现过的人名，按该册提及次数降序（共 6 个分册文件）
  存疑待核.txt            只被词性标注单独命中的候选（约六成真人名，慎用）
"""
import io
import json
import os

BASE = "/Users/zem/AI/READER"
D = os.path.join(BASE, "tmp", "解放战争-人名")
OUT = os.path.join(BASE, "解放战争-人名导入")
os.makedirs(OUT, exist_ok=True)

data = json.load(io.open(os.path.join(D, "人名-终校.json"), encoding="utf-8"))
N = data["names"]
per = data.get("per_volume") or json.load(io.open(os.path.join(D, "分册计数.json"), encoding="utf-8"))

SUB = {"一": "中原西南", "二": "中南", "三": "东北", "四": "华北", "五": "西北", "六": "华东"}


def write(path, words):
    seen, out = set(), []
    for w in words:
        w = w.strip()
        if w and w not in seen:
            seen.add(w)
            out.append(w)
    io.open(path, "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
    print("%-34s %4d 行  %.1f KB" % (os.path.basename(path), len(out),
                                     os.path.getsize(path) / 1024.0))


# 丢掉正文里其实一次都没独立出现过的截断形（如“阎揆”只会作为“阎揆要”的一部分出现）
keep = {w for w, e in N.items() if e.get("mentions", 0) >= 1}
write(os.path.join(OUT, "全部人名.txt"),
      [w for w, _ in sorted(N.items(), key=lambda kv: (-kv[1]["mentions"], kv[0])) if w in keep])

for v in ["一", "二", "三", "四", "五", "六"]:
    d = per.get(v, {})
    order = sorted(d.items(), key=lambda kv: (-kv[1]["n"], kv[0]))
    write(os.path.join(OUT, "第%s部-%s.txt" % (v, SUB[v])), [w for w, _ in order if w in keep])

write(os.path.join(OUT, "存疑待核.txt"),
      [w for w, _ in sorted(data["C1"].items(), key=lambda kv: (-kv[1].get("mentions", 0), kv[0]))])
