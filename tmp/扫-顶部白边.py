#!/usr/bin/env python3
"""逐列扫页面顶部的像素：第 0 行必须整宽纯白，第 1 行必须不再是白的（证明只有 1px）。
跑法：python3 tmp/扫-顶部白边.py <顶部条.png> [整页.png]
顶部条是 clip scale=8 截的，所以 1 个 CSS 像素 = 8 个图像行。"""
import sys

from PIL import Image

SCALE = 8
白 = (255, 255, 255)


def 行色(图, css行):
    """取某个 CSS 行中间那条图像行的所有像素。"""
    y = css行 * SCALE + SCALE // 2
    return [图.getpixel((x, y))[:3] for x in range(图.width)]


def 报(名字, 像素, 期望):
    命中 = [i for i, p in enumerate(像素) if p == 白]
    非命中 = [i for i, p in enumerate(像素) if p != 白]
    杂色 = sorted({p for p in 像素})[:6]
    print(f'  {名字}: 纯白列 {len(命中)}/{len(像素)}', end='')
    if 非命中:
        段 = []
        起 = 非命中[0]
        前 = 起
        for i in 非命中[1:] + [None]:
            if i != 前 + 1:
                段.append((起, 前))
                起 = 前 = i
            else:
                前 = i
        print(f'  非白段 {段[:8]}', end='')
    print(f'  出现的颜色 {杂色}')
    return len(命中), 像素


条 = Image.open(sys.argv[1]).convert('RGB')
print(f'{sys.argv[1]} 尺寸 {条.size}（CSS {条.width // SCALE}×{条.height // SCALE}）')
失败 = []
第0行 = 行色(条, 0)
白列, _ = 报('CSS 第0行', 第0行, 白)
if 白列 != 条.width:
    失败.append(f'第 0 行不是整宽纯白，只有 {白列}/{条.width} 列')
第1行 = 行色(条, 1)
报('CSS 第1行', 第1行, None)
中间 = 第1行[条.width // 4 : 条.width * 3 // 4]
if all(p == 白 for p in 中间):
    失败.append('第 1 行中段仍是纯白，白边不止 1px')
第2行 = 行色(条, 2)
报('CSS 第2行', 第2行, None)

if len(sys.argv) > 2:
    整 = Image.open(sys.argv[2]).convert('RGB')
    print(f'{sys.argv[2]} 尺寸 {整.size}（1:1）')
    for r in range(4):
        像素 = [整.getpixel((x, r))[:3] for x in range(整.width)]
        白数 = sum(1 for p in 像素 if p == 白)
        颜色 = sorted({p for p in 像素})[:6]
        print(f'  第{r}行: 纯白 {白数}/{整.width}  颜色 {颜色}')
    顶行 = [整.getpixel((x, 0))[:3] for x in range(整.width)]
    if any(p != 白 for p in 顶行):
        坏 = [i for i, p in enumerate(顶行) if p != 白]
        失败.append(f'整页第 0 行有 {len(坏)} 列非白，如 x={坏[:5]} 色={[顶行[i] for i in 坏[:5]]}')

if 失败:
    print('\n不通过：')
    for f in 失败:
        print(' -', f)
    sys.exit(1)
print('\n通过：顶部一整条 1px 纯白，往下立刻恢复原色。')
