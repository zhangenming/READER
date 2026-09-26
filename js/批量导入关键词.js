import { 元素, 状态 } from './状态.js';
import { 创建关键词标记, 查找关键词命中 } from './关键词.js';
import {
  解析批量关键词,
  描述批量解析,
  描述批量导入结果,
} from './批量导入解析.js';
import { 渲染可见行 } from './虚拟渲染.js';
import { 更新关键词指示器 } from './指示器.js';
import { 安排保存持久化状态 } from './持久化.js';

// 批量导入关键词：面板排序栏右端的「批量」入口 + 弹窗（一行一个词）。
// 解析与计数在 批量导入解析.js（纯函数），本模块只做 DOM 与状态写入。
// 命中扫描按词逐次全文查找，只在点击「导入」时执行；本书未出现的词不建标记，
// 避免面板与左缘刻度里多出没有命中的死条目。

let 反馈计时器 = 0;

function 已有关键词集合() {
  return new Set(
    状态.关键词列表
      .filter(function 排除临时关键词(关键词) {
        return !关键词.临时;
      })
      .map(function 读取文本(关键词) {
        return 关键词.文本;
      }),
  );
}

function 解析当前输入() {
  return 解析批量关键词(元素.批量导入输入框.value, 已有关键词集合());
}

/* 实时计数行与「导入」按钮可用性：输入停手 150ms 后再算，避免逐字重排。 */
function 更新解析反馈() {
  const 解析 = 解析当前输入();
  元素.批量导入反馈.textContent = 描述批量解析(解析);
  元素.批量导入确认按钮.disabled = !解析.待导入列表.length;
  return 解析;
}

function 延后更新解析反馈() {
  window.clearTimeout(反馈计时器);
  反馈计时器 = window.setTimeout(更新解析反馈, 150);
}

export function 打开批量导入弹窗() {
  if (!状态.文件名 || 元素.批量导入弹窗.open) {
    return;
  }
  元素.批量导入结果.textContent = '';
  元素.批量导入弹窗.showModal();
  更新解析反馈();
  元素.批量导入输入框.focus();
}

export function 关闭批量导入弹窗() {
  window.clearTimeout(反馈计时器);
  反馈计时器 = 0;
  if (元素.批量导入弹窗.open) {
    元素.批量导入弹窗.close();
  }
}

/* 逐个词扫全文命中，一次性提交渲染：只重建一次可见行与指示器。 */
function 执行批量导入() {
  if (!状态.文件名) {
    return;
  }
  const 开始时间 = performance.now();
  const 解析 = 解析当前输入();
  更新解析反馈();
  const 新增关键词列表 = [];
  const 未出现列表 = [];
  for (const 词 of 解析.待导入列表) {
    const 命中位置 = 查找关键词命中(词);
    if (!命中位置.length) {
      未出现列表.push(词);
      continue;
    }
    新增关键词列表.push(创建关键词标记(词, 命中位置));
  }

  if (新增关键词列表.length) {
    // 选中第一个新词：左缘刻度和面板立刻反映这次导入，但不移动阅读位置。
    状态.当前关键词id = 新增关键词列表[0].id;
    新增关键词列表[0].当前命中idx = 0;
    渲染可见行(true);
    更新关键词指示器();
    安排保存持久化状态();
  }

  元素.批量导入结果.textContent = 描述批量导入结果(
    新增关键词列表.length,
    未出现列表,
  );
  更新解析反馈();

  console.info('[阅读器] 批量导入关键词', {
    待导入: 解析.待导入列表.length,
    已导入: 新增关键词列表.length,
    本书未出现: 未出现列表.length,
    关键词总数: 状态.关键词列表.length,
    耗时毫秒: Math.round(performance.now() - 开始时间),
  });
}

export function 初始化批量导入关键词() {
  元素.关键词列表容器.addEventListener(
    'click',
    function 处理批量入口点击(事件) {
      if (事件.target.closest('button[data-batch-import]')) {
        打开批量导入弹窗();
      }
    },
  );
  元素.关闭批量导入按钮.addEventListener('click', 关闭批量导入弹窗);
  元素.批量导入确认按钮.addEventListener('click', 执行批量导入);
  元素.批量导入输入框.addEventListener('input', function 处理批量输入(事件) {
    if (!事件.isComposing) {
      延后更新解析反馈();
    }
  });
  元素.批量导入输入框.addEventListener('compositionend', 延后更新解析反馈);
  // 点击遮罩关闭：真实点击 ::backdrop 时事件目标是 html 而非 dialog 本身，
  // 因此用坐标命中判断，落在弹窗矩形之外即关闭（同 app.js 阅读统计弹窗）。
  document.addEventListener('pointerdown', function 处理批量弹窗按下(事件) {
    const 弹窗 = 元素.批量导入弹窗;
    if (!弹窗.open) {
      return;
    }
    const 矩形 = 弹窗.getBoundingClientRect();
    const { clientX: x, clientY: y } = 事件;
    if (x < 矩形.left || x > 矩形.right || y < 矩形.top || y > 矩形.bottom) {
      关闭批量导入弹窗();
    }
  });
  元素.批量导入弹窗.addEventListener('close', function 处理批量弹窗关闭() {
    window.clearTimeout(反馈计时器);
    反馈计时器 = 0;
  });
}
