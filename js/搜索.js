import { 高亮配色 } from './常量.js';

// 纯查询层：命中二分与配色计算。
// 不触碰 DOM 与全局状态（只读传入的关键词对象），可独立测试；
// 供 虚拟渲染 / 指示器 / 关键词 / 面板 共享，避免这些模块互相依赖。

export function 查找首个相交命中(关键词, 文本偏移) {
  let 左边界 = 0;
  let 右边界 = 关键词.命中位置.length;
  while (左边界 < 右边界) {
    const idx = (左边界 + 右边界) >>> 1;
    if (关键词.命中位置[idx] + 关键词.文本.length <= 文本偏移) {
      左边界 = idx + 1;
    } else {
      右边界 = idx;
    }
  }
  return 左边界;
}

export function 查找首个不小于的命中(关键词, 文本偏移) {
  let 左边界 = 0;
  let 右边界 = 关键词.命中位置.length;
  while (左边界 < 右边界) {
    const idx = (左边界 + 右边界) >>> 1;
    if (关键词.命中位置[idx] < 文本偏移) {
      左边界 = idx + 1;
    } else {
      右边界 = idx;
    }
  }
  return 左边界;
}

export function 二分查找精确命中(关键词, 文本偏移) {
  const idx = 查找首个不小于的命中(关键词, 文本偏移);
  return 关键词.命中位置[idx] === 文本偏移 ? idx : -1;
}

// 关键词深色用于普通正文与指示器，浅色用于面板、上下文与跳转边框。
export function 获取关键词配色(关键词) {
  return 高亮配色[关键词.配色idx % 高亮配色.length];
}
