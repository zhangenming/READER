# READER 架构视图 · 2026-09-18

由 `architecture-visualization` 插件产出的一次全量架构勘察（四个视角都做）。
所有结论均可回溯到具体 `文件:行号`；所有数字均由脚本生成，不手工维护。

## 基线事实（一句话）

31 个 ES Module（`js/` 29 + `app.js` + `语音订阅.js`）、144 条 import 边、**0 环**、最长路径深度 L0–L12、零运行时依赖、零构建。

## 产物索引

| 文件 | 回答什么问题 | 出自 |
| --- | --- | --- |
| `证据底稿.md` | 共用证据源：量化数据、分层、断环机制、自动滚动链路、不确定项 | `explore` |
| `模块图.json` | 31 节点 / 144 边的机器可读全量图（含 fanIn/fanOut/level/lines/具名导入） | 脚本 |
| `dependency-map.dot` | 全量依赖图，底色=传递依赖数（爆炸半径） | `dependency-impact-analyzer` + `graphviz` |
| `impact-map.dot` | 以**当前工作区未提交改动**为种子的爆炸半径图 | 同上 |
| `依赖影响分析.md` | 「改哪个模块波及谁」的五条结论 + 治理建议 | 同上 |
| `violations.csv` | 108 条跨层边 + 3 条 unstable_shared，机器可读 | 同上 |
| `reader.structurizr.dsl` | **C4 唯一事实源**：SystemContext / Containers / Components | `c4model` |
| `reader.architecture-understanding.md` | C4 怎么读、三种集成机制、假设与不确定项 | `system-modeler` + `c4model` |
| `flow-自动滚动.dot` | rAF 帧内时序：启动 → 每帧 → 50ms 节拍 → 停止（32 节点/27 边） | `flow-visualizer` + `graphviz` |
| `flow-自动滚动.md` | 同上的人话版 + 5 条风险与已排除的伪缺陷 | 同上 |
| `架构文档健康度校验.md` | 6 份文档 + 1 张知识卡 vs 当前代码：过期项、仍成立项、门禁缺口 | `architecture-health` |

## 复现命令链

```bash
node tmp/verify-模块图.mjs                                   # 门禁：无环 + 导出存在
node tmp/arch-模块图指标.mjs > tmp/架构视图-2026-09-18/模块图.json
node tmp/arch-生成-dot.mjs                                   # 出 dependency-map / impact-map / violations.csv
node tmp/arch-影响面.mjs                                     # 打印扇入扇出/半径/I 排名表
node tmp/arch-隐藏数据耦合.mjs                               # 90 条向上数据耦合
node tmp/arch-校验-dsl.mjs tmp/架构视图-2026-09-18/reader.structurizr.dsl
```

辅助脚本在 `tmp/arch-*.mjs`。`.dot` / `.csv` 为生成产物，**勿手改**，改数据源后重跑。

## 四条最该记住的结论

1. **无环是真的，但它是靠反转数据流换来的。** `js/状态.js` 可变单例造成 **90 条 import 图不可见的向上数据耦合**（19 个读方、34 个字段），写方 60 条来自 `app.js`。只看 DAG 会严重低估耦合。
2. **`app.js` 的 4 处断环回调是单点**（`app.js:346,350,367,395`）。删掉任一处，对应模块照常加载、**静默失效**，不会有 import 错误或启动异常。
3. **自动滚动的自适应调速环路只跑 20Hz，位置积分跑屏幕刷新率**（`js/自动滚动.js:594` 写入 → `:533` 下一帧才读）。改 `自动滚动界面间隔` 必须连带重估：调小会把 `scrollHeight` 读取搬回每帧，引入每帧强制重排。
4. **`js/调度.js` 不在自动滚动链路上**（`自动滚动.js` 未 import 它）；它只服务索引重建。这是此前排查滚动性能时的一个常见误解。

## 渲染与已知限制

- **本机未安装 graphviz**，两个 `.dot` 未经 `dot -Tsvg` 渲染；已用自写校验器确认语法自洽（无悬空端点、无自环、无重边、括号/引号成对）。请用 Qoder 的 DOT 格式预览查看。
- DSL 经自写校验器通过（该校验器已先用插件自带示例 `examples/basic-architecture/system-context.structurizr.dsl` 标定）。DSL 用 Qoder 的 **Structurizr DSL 格式预览**打开。
- DSL 中 `装配根→排版渲染`、`滚动跳转→排版渲染`、`交互外壳→滚动跳转` 三对元素上各挂着一条 `Import` 和一条 `HiddenDataFlow`，预览可能重叠成一条线；以 DSL 文本为准。
- **全部结论为静态阅读所得，未做运行时插桩。** 帧率、节拍达成率、90 条隐藏边的真实触发次数均未实测。
