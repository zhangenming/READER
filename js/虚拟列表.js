import { 虚拟列表缓冲行数 } from './常量.js';

// 词频弹窗表格的虚拟列表：固定行高 + 视口窗口切片，上下各留缓冲行，
// 用两条占位行把总高度撑出来，所以 DOM 里始终只有几十行，几万条也不卡。
// 与正文的 虚拟渲染.js 同一套思路，但那边是绝对定位的行盒、这边是 table 结构，
// 各自独立实现；一个滚动容器可以挂多张表（单字视图的「重复 / 只出现一次」并排）。
//
// 表格列表: [{ 表体, 列数, 创建行(项, 序号) }]
// 返回 { 设置数据(数据集), 刷新() }，数据集是与 表格列表 一一对应的行数组。

const 兜底行高 = 34; // 测量前的初值，与 .词频表格 td 的 height 一致
const 兜底视口高 = 480; // 容器未显示（clientHeight 为 0）时按这个高度渲染缓冲行

export function 创建虚拟列表(容器, 表格列表) {
  let 数据集 = 表格列表.map(function 创建空数据集() {
    return [];
  });
  let 行高 = 0;
  let 待渲染 = false;

  function 渲染() {
    待渲染 = false;
    const 单位行高 = 行高 || 兜底行高;
    const 视口起点 = 容器.scrollTop;
    const 视口终点 = 视口起点 + (容器.clientHeight || 兜底视口高);
    const 窗口起点 = Math.floor(视口起点 / 单位行高) - 虚拟列表缓冲行数;
    const 窗口终点 =
      Math.ceil(视口终点 / 单位行高) + 虚拟列表缓冲行数;    let 样本行 = null;

    表格列表.forEach(function 渲染一张表(表格, 表序号) {
      const 总行数 = 数据集[表序号].length;
      const 起点 = Math.max(0, Math.min(窗口起点, 总行数));
      const 终点 = Math.max(起点, Math.min(窗口终点, 总行数));
      const 片段 = document.createDocumentFragment();
      if (起点 > 0) {
        片段.append(创建占位行(表格.列数, 起点 * 单位行高));
      }
      for (let 序号 = 起点; 序号 < 终点; 序号 += 1) {
        const 行 = 表格.创建行(数据集[表序号][序号], 序号);
        if (!样本行) {
          样本行 = 行;
        }
        片段.append(行);
      }
      if (终点 < 总行数) {
        片段.append(创建占位行(表格.列数, (总行数 - 终点) * 单位行高));
      }
      表格.表体.replaceChildren(片段);
    });

    if (!行高 && 样本行?.offsetHeight) {
      行高 = 样本行.offsetHeight;
    }
  }

  function 安排渲染() {
    if (待渲染) {
      return;
    }
    待渲染 = true;
    requestAnimationFrame(渲染);
  }

  容器.addEventListener('scroll', 安排渲染);
  // 视口变高（窗口缩放、弹窗尺寸变化）后底部会空出一截，这里补一次渲染
  new ResizeObserver(安排渲染).observe(容器);

  return {
    设置数据(新数据集) {
      数据集 = 新数据集;
      行高 = 0; // 换数据（含字号、缩放变化）后重新量一次行高
      容器.scrollTop = 0;
      渲染();
    },
    刷新() {
      渲染();
    },
  };
}

function 创建占位行(列数, 高度) {
  const 行 = document.createElement('tr');
  const 格 = document.createElement('td');
  行.className = '虚拟占位';
  格.colSpan = 列数;
  格.style.height = `${高度}px`;
  行.append(格);
  return 行;
}
