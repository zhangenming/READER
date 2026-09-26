#!/usr/bin/env python3
# 把「本次整行视口」的改动单独重放到 HEAD 副本并只入索引，绝不动工作树
# （工作树里有并行会话未提交的白轴/正文宽度改动，不能夹带进本次提交）。
import subprocess, os, sys

根 = '/Users/zem/AI/READER'
暂存 = '/tmp/reader-stage'
os.makedirs(暂存 + '/js', exist_ok=True)

def head(path):
    return subprocess.run(['git', '-C', 根, 'show', f'HEAD:{path}'],
                          capture_output=True, text=True, check=True).stdout

编辑 = [
 ('styles.css', """  /* 行高度 = 字号：让每一行的实际高度与字符本身高度一致，截图里 .字 30×30 的状态。 */
  --行高: var(--正文字号);
""", """  /* 行高度 = 字号：让每一行的实际高度与字符本身高度一致，截图里 .字 30×30 的状态。 */
  --行高: var(--正文字号);
  /* 页面上下两条白线（body 的上下边框）。底部那条的高度由 JS 按行高反推
     （js/排版引擎.js 应用整行视口），使正文视口高恰好等于整数个行高：
     空格翻页后每一屏都是整行，不会再有半行字被视口底边切掉。
     顶线固定 1px，底线在 1px ~ 1px+行高 之间浮动，余数全由它吸收。
     凡按视口定位、需要与正文底边对齐的浮层（左缘轨道、右下角读数与按钮组）
     都读这两个变量，不用 100% / bottom: 0，否则轨道会比正文高一截、刻度错位。 */
  --顶部白线高: 1px;
  --底部白线高: 1px;
"""),
 ('styles.css', """  background: var(--背景色);
  border-top: 1px solid #fff;
  border-bottom: 1px solid #fff;
}
""", """  background: var(--背景色);
  border-top: var(--顶部白线高) solid #fff;
  border-bottom: var(--底部白线高) solid #fff;
}
"""),
 ('styles.css', """.章节轨道 {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 6;
  width: var(--白轴总宽);
  height: 100%;
""", """.章节轨道 {
  position: fixed;
  /* 与正文视口同顶同底：刻度 canvas 的 100% 必须等于 滚动容器.clientHeight，
     否则 JS 按 clientHeight 算出的刻度位置会被拉伸到底边线以下，越靠下越偏。 */
  top: var(--顶部白线高);
  left: 0;
  z-index: 6;
  width: var(--白轴总宽);
  height: calc(100% - var(--顶部白线高) - var(--底部白线高));
"""),
 ('styles.css', """  /* 紧贴右下角：正文纸面满幅铺到视口右缘，读数也以视口角落为锚 */
  right: 0;
  bottom: 0;
""", """  /* 紧贴正文右下角：正文纸面满幅铺到视口右缘，读数也以正文底边为锚。
     必须跟着 --底部白线高 抬起来——读数是纯白字，落在同色的白线上就等于消失。 */
  right: 0;
  bottom: var(--底部白线高);
"""),
 ('styles.css', """     按钮组再往左挪，否则第二行「总和」会压到「统计」按钮上。 */
  right: 172px;
  bottom: 10px;
""", """     按钮组再往左挪，否则第二行「总和」会压到「统计」按钮上。
     底部同样随白线抬起，与读数一起钉在正文底边而不是窗口底边。 */
  right: 172px;
  bottom: calc(var(--底部白线高) + 10px);
"""),
]

排版引擎头 = """// ===== 整行视口：底部白线高度自适应 =====
// body 的上下两条白线（CSS 变量 --顶部白线高 / --底部白线高）是页面唯一可伸缩的
// 竖向镶边。让底部那条吃掉「视口高 ÷ 行高」的余数，正文视口高就恰好等于
// 整数个行高 —— 空格翻页因此每一屏都是整行，首行与末行都不会再被视口边线
// 切成半截（原「底对齐 + 跳行比例」只救底边，顶边仍会残一行，见 js/键盘控制.js；
// 那套逻辑保留，用于兜底手动滚动停在非行界位置的情况）。
// 计算只依赖窗口高度与行高、不依赖自身结果，因此重复调用幂等：
// 白线变高 → 正文容器变矮 → ResizeObserver 重排 → 再算得同一值 → 收敛，不来回抖。
// 读写都只动 CSS 变量，样式里的轨道/读数跟着它对齐（见 styles.css --底部白线高）。
const 最小底部白线高 = 1; // px；底线再薄也留 1px，与顶线配对成画框
let 上次底部白线高 = null;

function 读取白线高(变量名, 兜底) {
  const 值 = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(变量名),
  );
  return Number.isFinite(值) ? 值 : 兜底;
}

// 返回本次排下的整行数（0 表示视口太矮、连一行都放不下，只能保持最小底线）
export function 应用整行视口(行高) {
  if (!(行高 > 0)) {
    return 0;
  }
  // 正文实测高 + 当前底线 = 「正文 + 底线」这一段的总高，顶线已在正文之外。
  // 用实测而非 innerHeight：以后正文上下再加镶边也不会算漏；容器未显示时退回视口高。
  const 正文高 = 元素.滚动容器.getBoundingClientRect?.().height ?? 0;
  const 可用 =
    正文高 > 0
      ? 正文高 + 读取白线高('--底部白线高', 最小底部白线高)
      : (window.innerHeight ?? 0) - 读取白线高('--顶部白线高', 1);
  if (!(可用 > 0)) {
    return 0; // 桩环境/无布局量不到视口：宁可不写，也不写进 NaNpx 让白线塌成 medium
  }
  const 整行数 = Math.max(
    0,
    Math.floor((可用 - 最小底部白线高) / 行高), // 至少给底线留 1px
  );
  if (整行数 < 1) {
    document.documentElement.style.setProperty(
      '--底部白线高',
      `${最小底部白线高}px`,
    );
    return 0;
  }
  const 底部白线高 = Math.max(
    最小底部白线高,
    可用 - 整行数 * 行高, // 余数全给底线吸收
  );
  document.documentElement.style.setProperty('--底部白线高', `${底部白线高}px`);
  if (上次底部白线高 !== 底部白线高) {
    上次底部白线高 = 底部白线高;
    console.info('[阅读器] 底部白线已按整行视口调整', {
      行高,
      整行数,
      底部白线高: +底部白线高.toFixed(2),
    });
  }
  return 整行数;
}

"""

编辑.append(('js/排版引擎.js', """export function 设置画布高度(总高度) {
  const 容器高度 = 元素.滚动容器.clientHeight;
""", 排版引擎头 + """export function 设置画布高度(总高度) {
  // 先收整行视口再量容器高：写变量后读布局属性会强制同步布局，量到的就是新值
  应用整行视口(状态.行高);
  const 容器高度 = 元素.滚动容器.clientHeight;
"""))

文本 = {}
for 路径, 旧, 新 in 编辑:
    内容 = 文本.get(路径) or head(路径)
    次数 = 内容.count(旧)
    if 次数 != 1:
        sys.exit(f'锚点在 {路径} 命中 {次数} 次，应为 1：{旧[:40]!r}')
    文本[路径] = 内容.replace(旧, 新, 1)

for 路径, 内容 in 文本.items():
    with open(os.path.join(暂存, 路径), 'w', encoding='utf-8') as f:
        f.write(内容)
    sha = subprocess.run(['git', '-C', 根, 'hash-object', '-w',
                          os.path.join(暂存, 路径)],
                         capture_output=True, text=True, check=True).stdout.strip()
    subprocess.run(['git', '-C', 根, 'update-index', '--cacheinfo',
                    f'100644,{sha},{路径}'], check=True)
    print(f'已入索引 {路径} -> {sha[:8]}')
print('完成：工作树未被改动')
