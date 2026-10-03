# 进度

- [x] 第1步 分块+候选扫描：66 块 / 9,086 候选（meta.json, chunks/, candidates.json）
- [x] 第2步 逐块精读 per-chunk/：66/66 块，3,006 条人物记录
- [x] 第3步 全局归并 merged-draft.json：1,587 种写法 → 922 人 + 129 条合称 + 31 条歧义称号不并条
- [x] 第4步 脚本核验 verification.json：163 条「0 次」全部定性（149 条为第99回名单「姓 讳 名」写法，14 条为笔误已下线）；4,723 条 count≥2 候选逐条给去向（存疑待核.txt）
- [x] 第5步 交付：人物名单.md · characters.json · 人名导入.txt
- 复跑顺序：流水线/归并-第3步.py → step-draft.py → scripts/verify_names.py → step-audit3.py → step-deliver.py → step-md.py
- 注意：本目录同期有另一会话在写同一批文件（merged-raw.json 非本次产物），人物名单.md 以本次 characters.json 为准
