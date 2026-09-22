#!/usr/bin/env python3
"""逐列扫页面上下那两条 1px 白边：边缘行必须整宽纯白，紧邻的内侧行必须不再是白的。
跑法：python3 tmp/扫-顶部白边.py <顶部条.png> [整页.png] [底部条.png]
边缘条是 clip scale=8 截的，所以 1 个 CSS 像素 = 8 个图像行。"""
import sys

from PIL import Image

SCALE = 8
白 = (255, 255, 255)


def 行色(图, css行):
    """取某个 CSS 行中间那条图像行的所有像素。"""
    y = css行 * SCALE + SCALE // 2
    return [图.getpixel((x, y))[:3] for x in range(图.width)]


def 报(名字, 像素):
    命中 = [i for i, p in enumerate(像素) if p == 白]
    非命中 = [i for i, p in enumerate(像素) if p != 白]
    段 = []
    if 非命中:
        起 = 前 = 非命中[0]
        for i in 非命中[1:] + [None]:
            if i != 前 + 1:
                段.append((起, 前))
                起 = 前 = i
            else:
                前 = i
    print(
        f'  {名字}: 纯白列 {len(命中)}/{len(像素)}'
        f'  非白段 {段[:8]}  颜色 {sorted({p for p in 像素})[:6]}'
    )
    return 命中


def 查边(失败, 图, 边行, 内行, 标签):
    """边行整宽纯白、内侧那一行中段不再是白，才算这条边只有 1px。"""
    白列 = 报(f'{标签} 边缘行', 行色(图, 边行))
    if len(白列) != 图.width:
        失败.append(f'{标签} 边缘行不是整宽纯白，只有 {len(白列)}/{图.width} 列')
    内 = 行色(图, 内行)
    报(f'{标签} 内侧行', 内)
    中间 = 内[图.width // 4 : 图.width * 3 // 4]
    if all(p == 白 for p in 中间):
        失败.append(f'{标签} 内侧行中段仍是纯白，白边不止 1px')


条 = Image.open(sys.argv[1]).convert('RGB')
print(f'{sys.argv[1]} 尺寸 {条.size}（CSS {条.width // SCALE}×{条.height // SCALE}）')
失败 = []
查边(失败, 条, 0, 1, '顶部')
报('顶部 第2行', 行色(条, 2))

if len(sys.argv) > 2:
    整 = Image.open(sys.argv[2]).convert('RGB')
    print(f'{sys.argv[2]} 尺寸 {整.size}（1:1）')
    for r in range(4):
        像素 = [整.getpixel((x, r))[:3] for x in range(整.width)]
        print(f'  第{r}行: 纯白 {sum(1 for p in 像素 if p == 白)}/{整.width}  颜色 {sorted({p for p in 像素})[:6]}')
    顶行 = [整.getpixel((x, 0))[:3] for x in range(整.width)]
    if any(p != 白 for p in 顶行):
        坏 = [i for i, p in enumerate(顶行) if p != 白]
        失败.append(f'整页第 0 行有 {len(坏)} 列非白，如 x={坏[:5]} 色={[顶行[i] for i in 坏[:5]]}')
    底行 = [整.getpixel((x, 整.height - 1))[:3] for x in range(整.width)]
    if any(p != 白 for p in 底行):
        坏 = [i for i, p in enumerate(底行) if p != 白]
        失败.append(f'整页最后一行有 {len(坏)} 列非白，如 x={坏[:5]} 色={[底行[i] for i in 坏[:5]]}')

if len(sys.argv) > 3:
    底 = Image.open(sys.argv[3]).convert('RGB')
    print(f'{sys.argv[3]} 尺寸 {底.size}（CSS {底.width // SCALE}×{底.height // SCALE}）')
    查边(失败, 底, 底.height // SCALE - 1, 底.height // SCALE - 2, '底部')

if 失败:
    print('\n不通过：')
    for f in 失败:
        print(' -', f)
    sys.exit(1)
print('\n通过：页面上下各一条 1px 纯白，往里立刻恢复原色。')
