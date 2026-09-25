import { 元素 } from './状态.js';

// 右下角时间浮层的遮挡判定：正文纸面满幅铺到视口右缘（见 .阅读区域），
// 滚动时底部几行的字会滚进浮层底下。此时隐藏整个浮层（时钟与自动滚动
// 读数同位），把右下角让给正文，避免浮层文字压在正文上。
// 判定用命中测试而非行几何：对浮层矩形均匀取采样点逐点 elementsFromPoint，
// 任一点拾取到 .字（正文字元素）即视为遮挡。elementsFromPoint 返回叠放
// 的全部元素，正文被按钮组盖住时仍能探到；浮层自身 pointer-events:none，
// 不会出现在命中结果里，其余非文字元素（按钮、画布、行底色）不算遮挡。
// 短行（段尾）与空行（段落间）在采样点下没有字盒，浮层照常显示。

const 采样列间距 = 12; // px；小于最小字号，连续排布的字盒不会从相邻采样点之间漏过
const 采样行数 = 3; // 浮层纵跨多行读数时上/中/下各探一层

let 刷新帧 = 0;

// 滚动驱动入口：rAF 合帧，一帧内多次滚动事件只做一次命中测试
export function 安排刷新时钟遮挡() {
  if (刷新帧) {
    return;
  }
  刷新帧 = requestAnimationFrame(function 执行时钟遮挡判定() {
    刷新帧 = 0;
    刷新时钟遮挡();
  });
}

export function 刷新时钟遮挡() {
  const 浮层 = 元素.时间信息;
  if (!浮层) {
    return;
  }
  const 矩形 = 浮层.getBoundingClientRect();
  浮层.classList.toggle('被正文遮挡', 浮层矩形下有正文(矩形));
}

function 浮层矩形下有正文(矩形) {
  const 列数 = Math.max(2, Math.ceil(矩形.width / 采样列间距) + 1);
  for (let 行序 = 0; 行序 < 采样行数; 行序 += 1) {
    const y = Math.round(矩形.top + ((矩形.height - 1) * 行序) / (采样行数 - 1));
    for (let 列序 = 0; 列序 < 列数; 列序 += 1) {
      const x = Math.round(矩形.left + ((矩形.width - 1) * 列序) / (列数 - 1));
      if (点位有正文(x, y)) {
        return true;
      }
    }
  }
  return false;
}

function 点位有正文(x, y) {
  if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
    return false;
  }
  return document.elementsFromPoint(x, y).some((节点) =>
    节点.classList?.contains('字'),
  );
}
